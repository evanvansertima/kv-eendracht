import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireAuth, requireRole, HttpError } from '../auth/middleware.ts';
import { translateDbError } from '../errors.ts';

/**
 * Community writes and moderation.
 *
 * The anti-abuse machinery is already in the database and stays there: rate limits fire
 * as triggers, trg_moderation_default forces new content from anonymous authors to
 * 'pending', is_blocked() is referenced by every insert policy, and feature_enabled()
 * is the kill switch. These handlers do not re-check any of it — they surface the Dutch
 * errors those triggers raise.
 *
 * That matters beyond tidiness: a check duplicated in the API can drift out of step with
 * the policy, and the policy is the one that actually holds.
 */

const uuid = z.string().uuid('Ongeldige verwijzing.');

/**
 * Subject vocabularies are the database's, not the API's.
 *
 * reactions_subject_type_check and reports_subject_type_check both enumerate these
 * exact strings. Inventing a friendlier set here ('topic', 'photo') and translating at
 * the boundary is how an API drifts out of step with its own constraints — the insert
 * simply fails with a CHECK violation, which is how this was caught.
 */
const SUBJECT_TYPES = ['forum_topic', 'forum_reply', 'media_upload', 'news_post'] as const;

/** The subset the moderation queue can act on. */
const MODERATABLE = ['forum_topic', 'forum_reply', 'media_upload'] as const;

export function registerCommunityRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null) =>
    withRls(config.DATABASE_URL, claims, fn);
  const moderator = requireRole('moderator', 'admin', 'super_admin');

  // ---------------------------------------------------------------- forum
  app.post('/v1/forum/topics', { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        category_id: uuid,
        title: z.string().trim().min(3, 'Geef je bericht een titel van minimaal 3 tekens.').max(140),
        body: z.string().trim().min(1, 'Schrijf een bericht.').max(8000),
      })
      .parse(req.body);

    const created = await db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.forum_topics (category_id, title, body, author_id)
         values ($1,$2,$3, auth.uid())
         returning id, title, moderation_status`,
        [body.category_id, body.title, body.body],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  app.get('/v1/forum/topics/:id', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      const topic = await tx.query(
        `select t.id, t.title, t.body, t.created_at, t.is_locked, t.is_pinned,
                t.reply_count, t.like_count, t.moderation_status,
                c.name as category_name, p.display_name as author_name
           from public.forum_topics t
           left join public.forum_categories c on c.id = t.category_id
           left join public.v_profiles_public p on p.id = t.author_id
          where t.id = $1 and t.deleted_at is null`,
        [id],
      );
      if (!topic.rows[0]) throw new HttpError(404, 'Bericht niet gevonden.');

      const replies = await tx.query(
        `select r.id, r.body, r.parent_id, r.created_at, r.like_count,
                p.display_name as author_name
           from public.forum_replies r
           left join public.v_profiles_public p on p.id = r.author_id
          where r.topic_id = $1 and r.deleted_at is null
          order by r.created_at`,
        [id],
      );

      return { topic: topic.rows[0], replies: replies.rows };
    }, req.claims);
  });

  app.post('/v1/forum/topics/:id/replies', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        body: z.string().trim().min(1, 'Schrijf een reactie.').max(4000),
        // Nesting deeper than one level is rejected by the check_reply_depth trigger.
        parent_id: uuid.nullable().optional(),
      })
      .parse(req.body);

    const created = await db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.forum_replies (topic_id, parent_id, body, author_id)
         values ($1,$2,$3, auth.uid()) returning id, moderation_status`,
        [id, body.parent_id ?? null, body.body],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  // ---------------------------------------------------------------- likes
  //
  // The one place optimistic updates are permitted (spec section 3): safe and
  // idempotent. The unique constraint makes a double-tap a no-op rather than an error.
  app.post('/v1/reactions', { preHandler: requireAuth }, async (req) => {
    const body = z
      .object({ subject_type: z.enum(SUBJECT_TYPES), subject_id: uuid })
      .parse(req.body);

    return db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.reactions (user_id, subject_type, subject_id)
         values (auth.uid(), $1, $2)
         on conflict (user_id, subject_type, subject_id) do nothing
         returning id`,
        [body.subject_type, body.subject_id],
      );
      return { liked: true, created: rows.length > 0 };
    }, req.claims).catch(translateDbError);
  });

  app.delete('/v1/reactions', { preHandler: requireAuth }, async (req) => {
    const body = z
      .object({ subject_type: z.enum(SUBJECT_TYPES), subject_id: uuid })
      .parse(req.body);

    return db(async (tx) => {
      await tx.query(
        `delete from public.reactions
          where user_id = auth.uid() and subject_type = $1 and subject_id = $2`,
        [body.subject_type, body.subject_id],
      );
      return { liked: false };
    }, req.claims).catch(translateDbError);
  });

  // ---------------------------------------------------------------- polls
  app.post('/v1/polls/:id/vote', { preHandler: requireAuth }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z.object({ option_id: uuid }).parse(req.body);

    return db(async (tx) => {
      // One vote per user per poll, enforced by a unique constraint. The friendly Dutch
      // message for a repeat comes from the constraint translator.
      await tx.query(
        `insert into public.poll_votes (poll_id, option_id, user_id)
         values ($1, $2, auth.uid())`,
        [id, body.option_id],
      );
      const { rows } = await tx.query(
        `select option_id, label, votes from public.v_poll_results
          where poll_id = $1 order by sort_order`,
        [id],
      );
      return { voted: true, results: rows };
    }, req.claims).catch(translateDbError);
  });

  // ---------------------------------------------------------------- reports
  app.post('/v1/reports', { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        subject_type: z.enum(SUBJECT_TYPES),
        subject_id: uuid,
        reason: z.string().trim().min(3, 'Geef kort aan waarom je dit meldt.').max(500),
      })
      .parse(req.body);

    await db(async (tx) => {
      await tx.query(
        `insert into public.reports (subject_type, subject_id, reason, reporter_id)
         values ($1,$2,$3, auth.uid())`,
        [body.subject_type, body.subject_id, body.reason],
      );
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return { ok: true };
  });

  // ---------------------------------------------------------------- moderation
  app.get('/v1/moderation/queue', { preHandler: moderator }, async (req) =>
    db(async (tx) => {
      const queue = await tx.query(
        `select subject_type, subject_id, preview, created_at
           from public.v_moderation_queue order by created_at asc`,
      );
      const reports = await tx.query(
        `select id, subject_type, subject_id, reason, status, created_at
           from public.reports where status = 'open' order by created_at asc`,
      );
      return { queue: queue.rows, reports: reports.rows };
    }, req.claims).catch(translateDbError),
  );

  const TABLE_FOR: Record<string, string> = {
    forum_topic: 'forum_topics',
    forum_reply: 'forum_replies',
    media_upload: 'media_uploads',
  };

  app.post('/v1/moderation/:type/:id/:action', { preHandler: moderator }, async (req) => {
    const params = z
      .object({
        type: z.enum(MODERATABLE),
        id: uuid,
        action: z.enum(['approve', 'reject', 'hide']),
      })
      .parse(req.params);
    const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});

    const status =
      params.action === 'approve' ? 'approved' : params.action === 'reject' ? 'rejected' : 'hidden';

    return db(async (tx) => {
      // Table chosen from a fixed map, never interpolated from user input.
      const table = TABLE_FOR[params.type]!;
      const hasReason = params.type === 'media_upload';
      const { rows } = await tx.query(
        `update public.${table}
            set moderation_status = $2
                ${hasReason ? ', rejection_reason = $3, moderated_by = auth.uid(), moderated_at = now()' : ''}
          where id = $1 returning id, moderation_status`,
        hasReason ? [params.id, status, body.reason ?? null] : [params.id, status],
      );
      if (!rows[0]) throw new HttpError(404, 'Item niet gevonden.');
      return rows[0];
    }, req.claims).catch(translateDbError);
  });

  app.post('/v1/moderation/reports/:id/resolve', { preHandler: moderator }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z.object({ status: z.enum(['resolved', 'dismissed']) }).parse(req.body);

    return db(async (tx) => {
      const { rows } = await tx.query(
        'update public.reports set status = $2 where id = $1 returning id, status',
        [id, body.status],
      );
      if (!rows[0]) throw new HttpError(404, 'Melding niet gevonden.');
      return rows[0];
    }, req.claims).catch(translateDbError);
  });

  app.post('/v1/moderation/block', { preHandler: moderator }, async (req, reply) => {
    const body = z
      .object({
        user_id: uuid,
        reason: z.string().trim().min(3, 'Geef een reden op.').max(300),
        expires_at: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(req.body);

    await db(async (tx) => {
      await tx.query(
        `insert into public.blocked_users (user_id, reason, blocked_by, expires_at)
         values ($1,$2, auth.uid(), $3)`,
        [body.user_id, body.reason, body.expires_at ?? null],
      );
      // is_blocked() reads profiles, so the flag must be set there too.
      await tx.query('update public.profiles set is_blocked = true where id = $1', [body.user_id]);
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return { ok: true };
  });
}
