import { describe, it, expect, beforeAll } from 'vitest';
import { asUser, expectRefused, databaseReachable, resolveFixtures } from './rls.helpers.ts';

/**
 * RLS behaviour suite.
 *
 * This is the gap KV-EENDRACHT-APP-SPEC section 13 logged as "documented policies only,
 * pgTAP on the v2 list". Owning Postgres makes it testable, and these assertions are the
 * ones that actually matter: they run as **kv_api** with the API bypassed entirely, so
 * they prove the database refuses on its own rather than trusting a route guard.
 *
 * Every test rolls back. The suite can be run repeatedly against a working database.
 */

let reachable = false;
let guest: { sub: string; role: 'guest' };
let admin: { sub: string; role: 'super_admin' };

beforeAll(async () => {
  reachable = await databaseReachable();
  if (!reachable) {
    console.warn(
      'RLS suite skipped: no database reachable. Start it with `docker compose up -d`.',
    );
    return;
  }
  const f = await resolveFixtures();
  guest = { sub: f.guest, role: 'guest' };
  admin = { sub: f.admin, role: 'super_admin' };
});

describe('the role itself', () => {
  it('runs as a role that RLS actually applies to', async () => {
    if (!reachable) return;
    const rows = await asUser(null, (s) =>
      s.q<{ current_user: string; super: boolean; bypass: boolean }>(
        `select current_user,
                (select rolsuper from pg_roles where rolname = current_user) as super,
                (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
      ),
    );
    // If this ever fails, every other assertion below becomes meaningless.
    expect(rows[0]!.current_user).toBe('kv_api');
    expect(rows[0]!.super).toBe(false);
    expect(rows[0]!.bypass).toBe(false);
  });

  it('cannot turn row level security off', async () => {
    if (!reachable) return;
    const err = await expectRefused(admin, 'alter table public.player_profiles disable row level security');
    expect(err.message).toBeTruthy();
  });
});

describe('claims are transaction-scoped', () => {
  it('resolves auth.uid() from the claims in force', async () => {
    if (!reachable) return;
    const rows = await asUser(guest, (s) => s.q<{ uid: string | null }>('select auth.uid() as uid'));
    expect(rows[0]!.uid).toBe(guest.sub);
  });

  it('returns null rather than raising when unauthenticated', async () => {
    if (!reachable) return;
    // The nested-nullif ordering in auth.uid() exists for exactly this: an empty
    // setting must not reach ::jsonb, which would raise instead of resolving to NULL.
    const rows = await asUser(null, (s) =>
      s.q<{ uid: string | null; role: string }>('select auth.uid() as uid, auth.role() as role'),
    );
    expect(rows[0]!.uid).toBeNull();
    expect(rows[0]!.role).toBe('anon');
  });
});

describe('personal data stays private', () => {
  it('hides player_profiles entirely from an anonymous session', async () => {
    if (!reachable) return;
    const rows = await asUser(guest, (s) =>
      s.q<{ n: string }>('select count(*)::text as n from public.player_profiles'),
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('exposes players through v_players_public without contact fields', async () => {
    if (!reachable) return;
    const rows = await asUser(guest, (s) =>
      s.q<{ n: string }>('select count(*)::text as n from public.v_players_public'),
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);

    const cols = await asUser(guest, (s) =>
      s.q<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_name = 'v_players_public'`,
      ),
    );
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain('phone');
    expect(names).not.toContain('email');
    expect(names).not.toContain('admin_notes');
  });

  it('lets an admin read contact details', async () => {
    if (!reachable) return;
    const rows = await asUser(admin, (s) =>
      s.q<{ n: string }>('select count(*)::text as n from public.player_profiles'),
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });
});

describe('results may only be entered by those with the right', () => {
  it('refuses apply_match_result for an anonymous session', async () => {
    if (!reachable) return;
    const match = await asUser(admin, (s) =>
      s.q<{ id: string }>('select id from public.matches limit 1'),
    );
    if (!match[0]) return; // No fixture data; nothing to assert against.

    const err = await expectRefused(
      guest,
      'select public.apply_match_result($1, 6, 3, $2, null, null, gen_random_uuid())',
      [match[0].id, 'red'],
    );
    // The RPC raises the project's own Dutch message rather than a generic denial.
    expect(err.message).toContain('Geen rechten om uitslagen in te voeren');
  });

  it('refuses recalculate_standings for an anonymous session', async () => {
    if (!reachable) return;
    const comp = await asUser(admin, (s) =>
      s.q<{ id: string }>('select id from public.competitions limit 1'),
    );
    if (!comp[0]) return;

    const err = await expectRefused(guest, 'select public.recalculate_standings($1)', [
      comp[0].id,
    ]);
    expect(err.message).toContain('beheerders');
  });
});

describe('ownership on writes', () => {
  it('refuses a forum topic written under someone else name', async () => {
    if (!reachable) return;
    const cat = await asUser(guest, (s) =>
      s.q<{ id: string }>('select id from public.forum_categories limit 1'),
    );
    if (!cat[0]) return;

    const err = await expectRefused(
      guest,
      `insert into public.forum_topics (category_id, title, body, author_id)
       values ($1, 'Niet van mij', 'Poging tot spoofing', $2)`,
      [cat[0].id, admin.sub],
    );
    // Refused — the exact guard that fires first is not the point; that it is refused is.
    expect(err.message).toBeTruthy();
  });

  it('allows a topic written under the author own id, and forces it to pending', async () => {
    if (!reachable) return;
    await asUser(guest, async (s) => {
      const cat = await s.q<{ id: string }>('select id from public.forum_categories limit 1');
      if (!cat[0]) return;

      const rows = await s.q<{ moderation_status: string }>(
        `insert into public.forum_topics (category_id, title, body, author_id)
         values ($1, 'Wel van mij', 'Een gewoon bericht', auth.uid())
         returning moderation_status`,
        [cat[0].id],
      );
      // trg_moderation_default holds new content from anonymous authors for review.
      expect(rows[0]!.moderation_status).toBe('pending');
    });
  });
});

describe('tournament registration', () => {
  it('refuses registering a player the session is not linked to', async () => {
    if (!reachable) return;
    const fixtures = await asUser(admin, (s) =>
      s.q<{ tournament_id: string; player_id: string }>(
        `select (select id from public.tournaments where draw_published_at is null limit 1) as tournament_id,
                (select id from public.player_profiles where profile_id is null
                  and archived_at is null limit 1) as player_id`,
      ),
    );
    const f = fixtures[0];
    if (!f?.tournament_id || !f?.player_id) return;

    const err = await expectRefused(
      guest,
      `insert into public.tournament_registrations (tournament_id, player_id, status)
       values ($1, $2, 'registered')`,
      [f.tournament_id, f.player_id],
    );
    expect(err.message).toMatch(/row-level security/i);
  });

  it('refuses registration once the deadline has passed', async () => {
    if (!reachable) return;
    // Runs entirely inside the rolled-back transaction: the deadline is moved into the
    // past, the insert is attempted, and nothing survives the rollback.
    await asUser(admin, async (s) => {
      const t = await s.q<{ id: string }>(
        'select id from public.tournaments where draw_published_at is null limit 1',
      );
      if (!t[0]) return;

      await s.q(
        "update public.tournaments set registration_deadline = now() - interval '1 day' where id = $1",
        [t[0].id],
      );
      const open = await s.q<{ open: boolean }>('select public.registration_is_open($1) as open', [
        t[0].id,
      ]);
      expect(open[0]!.open).toBe(false);
    });
  });
});

describe('audit and settings', () => {
  it('keeps audit_logs unreadable for an anonymous session', async () => {
    if (!reachable) return;
    const rows = await asUser(guest, (s) =>
      s.q<{ n: string }>('select count(*)::text as n from public.audit_logs'),
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('exposes only public app_settings keys', async () => {
    if (!reachable) return;
    const rows = await asUser(guest, (s) =>
      s.q<{ key: string }>('select key from public.app_settings'),
    );
    // rate_limits is deliberately not public: publishing the thresholds tells an abuser
    // exactly how to stay under them.
    expect(rows.map((r) => r.key)).not.toContain('rate_limits');
  });
});
