import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireRole, HttpError } from '../auth/middleware.ts';
import { translateDbError } from '../errors.ts';

/**
 * Agenda management.
 *
 * `is_published` already gates public visibility in RLS, so these handlers only decide
 * what an admin may write — the database decides who may read it back.
 */

const uuid = z.string().uuid('Ongeldige verwijzing.');

const eventSchema = z.object({
  title: z.string().trim().min(3, 'Geef de activiteit een titel van minimaal 3 tekens.').max(140),
  description: z.string().max(4000).nullable().optional(),
  // Free text with a suggestion list in the UI, so a new category never needs a
  // migration — see KV-EENDRACHT-APP-SPEC section 7.
  event_type: z.string().max(60).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  image_url: z.string().url('Vul een geldige URL in.').max(500).nullable().optional(),
  organizer: z.string().max(120).nullable().optional(),
  audience: z.string().max(80).nullable().optional(),
  tournament_id: uuid.nullable().optional(),
  competition_id: uuid.nullable().optional(),
  is_published: z.boolean().optional(),
});

export function registerContentRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null) =>
    withRls(config.DATABASE_URL, claims, fn);
  const admin = requireRole('admin', 'super_admin');

  /** Admin listing: includes drafts, which the public endpoint must never show. */
  app.get('/v1/admin/agenda', { preHandler: admin }, async (req) =>
    db(async (tx) => {
      const { rows } = await tx.query(
        `select id, title, description, event_type, starts_at, ends_at, location,
                image_url, organizer, audience, is_published, tournament_id, competition_id
           from public.agenda_events
          order by starts_at desc`,
      );
      return { items: rows };
    }, req.claims).catch(translateDbError),
  );

  app.post('/v1/admin/agenda', { preHandler: admin }, async (req, reply) => {
    const body = eventSchema.parse(req.body);

    if (body.ends_at && new Date(body.ends_at) < new Date(body.starts_at)) {
      throw new HttpError(400, 'De einddatum ligt vóór de startdatum.');
    }

    const created = await db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.agenda_events
           (title, description, event_type, starts_at, ends_at, location, image_url,
            organizer, audience, tournament_id, competition_id, is_published, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, coalesce($12,false), auth.uid())
         returning id, title, is_published`,
        [
          body.title, body.description ?? null, body.event_type ?? null, body.starts_at,
          body.ends_at ?? null, body.location ?? null, body.image_url ?? null,
          body.organizer ?? null, body.audience ?? null, body.tournament_id ?? null,
          body.competition_id ?? null, body.is_published ?? null,
        ],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  app.patch('/v1/admin/agenda/:id', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = eventSchema.partial().parse(req.body);

    const fields = Object.entries(body).filter(([, v]) => v !== undefined);
    if (fields.length === 0) throw new HttpError(400, 'Geen wijzigingen opgegeven.');

    return db(async (tx) => {
      const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await tx.query(
        `update public.agenda_events set ${sets} where id = $1
         returning id, title, is_published`,
        [id, ...fields.map(([, v]) => v)],
      );
      if (!rows[0]) throw new HttpError(404, 'Activiteit niet gevonden.');
      return rows[0];
    }, req.claims).catch(translateDbError);
  });

  app.delete('/v1/admin/agenda/:id', { preHandler: admin }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    await db(async (tx) => {
      // Agenda events carry no historical results, so a real delete is safe here —
      // unlike players or teams, which are archived (CLAUDE.md rule 10).
      const { rowCount } = await tx.query('delete from public.agenda_events where id = $1', [id]);
      if (!rowCount) throw new HttpError(404, 'Activiteit niet gevonden.');
    }, req.claims).catch(translateDbError);

    reply.status(204);
    return null;
  });
}
