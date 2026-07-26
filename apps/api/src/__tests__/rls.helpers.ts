import { Client } from 'pg';

/**
 * Helpers for the RLS behaviour suite.
 *
 * Two properties make these tests trustworthy:
 *
 * 1. They connect as **kv_api** — the role the API actually uses, which is neither
 *    superuser nor BYPASSRLS. Running them as kv_owner would pass everything while
 *    proving nothing.
 * 2. Every test runs inside a transaction that is **always rolled back**, so the suite
 *    leaves the database exactly as it found it and can run repeatedly against a
 *    developer's own data.
 */

const URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://kv_api:kaatsen2026@localhost:5432/kv_eendracht';

export type Session = {
  /** Runs a query with the given claims in force. */
  q<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
};

export type Claims = {
  sub?: string | null;
  role?: 'guest' | 'moderator' | 'admin' | 'super_admin';
};

/**
 * Opens a transaction with the given claims, runs the body, then ALWAYS rolls back.
 *
 * `set_config(..., true)` scopes the claims to this transaction, exactly as the API's
 * withRls does — which is also the property that makes connection pooling safe.
 */
export async function asUser<T>(
  claims: Claims | null,
  body: (s: Session) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: URL });
  await client.connect();
  try {
    await client.query('begin');

    if (claims) {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: claims.sub ?? null, role: claims.role ?? 'guest' }),
      ]);
    }

    const session: Session = {
      async q(sql, params) {
        const { rows } = await client.query(sql, params);
        return rows as never;
      },
    };

    return await body(session);
  } finally {
    // Rollback even on failure: a test that throws must not leave rows behind.
    await client.query('rollback').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

/** Asserts a statement is refused, and returns the Postgres error for inspection. */
export async function expectRefused(
  claims: Claims | null,
  sql: string,
  params?: unknown[],
): Promise<{ code?: string; message: string }> {
  try {
    await asUser(claims, (s) => s.q(sql, params));
  } catch (err) {
    const e = err as { code?: string; message: string };
    return { code: e.code, message: e.message };
  }
  throw new Error(`Expected the statement to be refused, but it succeeded:\n${sql}`);
}

/**
 * Fixture ids, resolved from the database rather than hardcoded.
 *
 * A guessed id is worse than no id: an id that does not exist makes writes fail on a
 * foreign key inside the rate-limit trigger, which looks exactly like RLS refusing and
 * turns a real assertion into a test that passes for the wrong reason. Asking the
 * database removes that whole class of false green.
 */
export async function resolveFixtures(): Promise<{ admin: string; guest: string }> {
  const client = new Client({ connectionString: URL });
  await client.connect();
  try {
    // Read as kv_api under admin claims so profiles is visible.
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', role: 'super_admin' }),
    ]);
    const { rows } = await client.query<{ id: string; role: string; is_anonymous: boolean }>(
      `select id, role, is_anonymous from public.profiles
        where role in ('super_admin','admin') or is_anonymous
        order by case when role in ('super_admin','admin') then 0 else 1 end, created_at`,
    );
    await client.query('rollback');

    const admin = rows.find((r) => r.role === 'super_admin' || r.role === 'admin');
    const guest = rows.find((r) => r.is_anonymous);
    if (!admin || !guest) {
      throw new Error('Fixtures missing: need one admin and one anonymous profile. Run db:seed.');
    }
    return { admin: admin.id, guest: guest.id };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Skips the suite with a clear reason when no database is reachable. */
export async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: URL });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}
