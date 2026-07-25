import type { FastifyInstance } from 'fastify';
import { withRls } from './db.ts';
import type { Config } from './config.ts';

/**
 * Public read endpoints.
 *
 * Every handler runs through withRls with the request's claims — null for an anonymous
 * visitor. What comes back is therefore whatever the RLS policies permit, not whatever
 * the query asked for. Draft agenda items, unpublished news and player contact details
 * are filtered by Postgres, so a mistake here cannot leak them.
 *
 * Player data is read from v_players_public, which omits phone, email and admin_notes
 * entirely. See KV-EENDRACHT-APP-SPEC §9.
 */
export function registerRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2]) =>
    withRls<T>(config.DATABASE_URL, null, fn);

  app.get('/v1/health', async () => {
    const started = Date.now();
    const ok = await db(async (tx) => {
      const { rows } = await tx.query('select 1 as ok');
      return rows[0]?.ok === 1;
    });
    return {
      status: ok ? 'ok' : 'degraded',
      database: ok ? 'up' : 'down',
      latencyMs: Date.now() - started,
    };
  });

  app.get('/v1/agenda', async () => {
    const rows = await db(async (tx) => {
      const { rows } = await tx.query(`
        select id, title, description, event_type, starts_at, ends_at,
               location, organizer, audience
          from public.agenda_events
         order by starts_at asc
      `);
      return rows;
    });
    return { items: rows };
  });

  app.get('/v1/news', async () => {
    const rows = await db(async (tx) => {
      const { rows } = await tx.query(`
        select id, title, intro, category, author_name, is_featured, published_at
          from public.news_posts
         order by published_at desc nulls last
      `);
      return rows;
    });
    return { items: rows };
  });

  app.get('/v1/tournaments', async () => {
    const rows = await db(async (tx) => {
      const { rows } = await tx.query(`
        select id, name, played_on, location, match_system, formation_category, status
          from public.tournaments
         order by played_on desc
      `);
      return rows;
    });
    return { items: rows };
  });

  app.get('/v1/standings', async () => {
    const rows = await db(async (tx) => {
      const { rows } = await tx.query(`
        select player_id, display_name, eersten_voor, eersten_tegen, saldo,
               deelnames, gespeeld, gewonnen, verloren, position, previous_position
          from public.v_competition_standings
         order by position asc nulls last
      `);
      return rows;
    });
    return { items: rows };
  });

  app.get('/v1/forum/categories', async () => {
    const rows = await db(async (tx) => {
      const { rows } = await tx.query(`
        select id, name, description, sort_order
          from public.forum_categories
         order by sort_order asc, name asc
      `);
      return rows;
    });
    return { items: rows };
  });

  app.get('/v1/forum/topics', async () => {
    const rows = await db(async (tx) => {
      // Author names come from v_profiles_public, never profiles: that view exposes only
      // id, display_name and is_anonymous. RLS also hides topics that are not approved.
      const { rows } = await tx.query(`
        select t.id, t.title, t.body, t.category_id, c.name as category_name,
               t.is_pinned, t.is_locked, t.reply_count, t.like_count, t.created_at,
               p.display_name as author_name, p.is_anonymous
          from public.forum_topics t
          left join public.forum_categories c on c.id = t.category_id
          left join public.v_profiles_public p on p.id = t.author_id
         where t.deleted_at is null
         order by t.is_pinned desc, t.created_at desc
      `);
      return rows;
    });
    return { items: rows };
  });

  app.get('/v1/polls/active', async () => {
    const poll = await db(async (tx) => {
      const { rows } = await tx.query(`
        select id, question, results_visible, is_closed, starts_at, ends_at
          from public.polls
         where not is_closed
         order by starts_at desc nulls last
         limit 1
      `);
      const found = rows[0];
      if (!found) return null;

      // Totals only, via v_poll_results — individual votes stay private.
      const { rows: options } = await tx.query(
        `select option_id, label, votes, sort_order
           from public.v_poll_results
          where poll_id = $1
          order by sort_order asc`,
        [found.id],
      );
      return { ...found, options };
    });
    return { poll };
  });

  app.get('/v1/players', async () => {
    const rows = await db(async (tx) => {
      // v_players_public, never player_profiles: contact details must not be reachable
      // without is_admin(). See KV-EENDRACHT-APP-SPEC §9.
      const { rows } = await tx.query(`
        select id, display_name, age_category, gender, skill_level, club
          from public.v_players_public
         order by display_name asc
      `);
      return rows;
    });
    return { items: rows };
  });
}
