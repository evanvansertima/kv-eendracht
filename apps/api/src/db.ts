import pg from 'pg';

export type Claims = {
  sub: string;
  role?: string;
  email?: string;
  is_anonymous?: boolean;
};

let pool: pg.Pool | undefined;

export function getPool(connectionString: string): pg.Pool {
  pool ??= new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Runs `fn` inside one transaction with the request's JWT claims applied, so every RLS
 * policy sees the correct auth.uid().
 *
 * Two details carry the whole authorization model:
 *
 *  1. `set_config(..., true)` makes the setting **transaction-local**. Without the
 *     `true`, the value would persist on the pooled connection and leak one user's
 *     identity into the next request that happened to reuse it.
 *
 *  2. Passing `null` claims sets nothing, so auth.uid() returns NULL and the caller
 *     sees exactly what an unauthenticated visitor sees. That is the correct default,
 *     not an error case.
 *
 * Verified against Postgres 17: with no claims a policy-protected table returns zero
 * rows, and claims do not survive the commit.
 */
export async function withRls<T>(
  connectionString: string,
  claims: Claims | null,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool(connectionString).connect();
  try {
    await client.query('begin');
    if (claims) {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify(claims),
      ]);
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {
      /* the connection is already broken; the original error is the useful one */
    });
    throw err;
  } finally {
    client.release();
  }
}
