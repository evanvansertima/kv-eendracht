import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type pg from 'pg';
import type { Claims } from '../db.ts';

/**
 * Token and password primitives.
 *
 * Deliberately boring: Argon2id for passwords, HS256 JWTs for access, opaque random
 * strings for refresh. No custom cryptography anywhere.
 */

export const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TTL_DAYS = 30;

// ---------------------------------------------------------------- passwords

/**
 * Argon2id, OWASP's recommended parameters. Hashing and verification happen HERE, in
 * Node — never through Postgres `crypt()`, which would place the hash into query text
 * and therefore into query logs and `pg_stat_statements`.
 */
const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await argonVerify(stored, plain);
  } catch {
    // A malformed or unrecognised hash is a failed login, not a crash. The seed used to
    // carry bcrypt hashes; those simply no longer verify and the account needs a reset.
    return false;
  }
}

/**
 * Constant-time comparison for the dummy-verify path below.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * A precomputed hash to verify against when the email does not exist.
 *
 * Without this, a missing account returns in microseconds while a real one costs a full
 * Argon2 verification, and that timing difference tells an attacker which emails are
 * registered. Verifying a throwaway hash makes both paths cost the same.
 */
let dummyHash: string | undefined;
export async function dummyVerify(plain: string): Promise<void> {
  dummyHash ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(plain, dummyHash);
}

// ---------------------------------------------------------------- access tokens

export async function signAccessToken(claims: Claims, secret: string): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('kv-eendracht')
    .setAudience('kv-eendracht-app')
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'kv-eendracht',
      audience: 'kv-eendracht-app',
    });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      is_anonymous: payload.is_anonymous === true,
    };
  } catch {
    // Expired, wrong signature, wrong issuer — all mean "not authenticated".
    return null;
  }
}

// ---------------------------------------------------------------- refresh tokens

/** Opaque, high-entropy. Never a JWT: these must be revocable, which a JWT is not. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored, so a database leak yields no usable sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type RefreshResult =
  | { ok: true; userId: string; familyId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' }
  | { ok: false; reason: 'reused'; familyId: string };

/**
 * Validates a presented refresh token and marks it used.
 *
 * Reuse detection is the security-relevant part: a token that was already consumed means
 * two parties hold it, and there is no way to tell the legitimate client from the thief.
 * The safe response is to revoke the whole family and force a fresh login.
 *
 * This function REPORTS reuse but does not act on it, and that separation is deliberate.
 * Revoking here would happen inside the caller's transaction, which then throws to return
 * 401 — rolling the revocation back and leaving the stolen family alive. The caller must
 * revoke in its own committed transaction. Found by testing that a reused token actually
 * killed its successor; it did not.
 */
export async function consumeRefreshToken(
  tx: pg.PoolClient,
  token: string,
): Promise<RefreshResult> {
  const { rows } = await tx.query<{
    id: string;
    user_id: string;
    family_id: string;
    expires_at: Date;
    used_at: Date | null;
    revoked_at: Date | null;
  }>(
    `select id, user_id, family_id, expires_at, used_at, revoked_at
       from auth.refresh_tokens where token_hash = $1`,
    [hashToken(token)],
  );

  const row = rows[0];
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };

  if (row.used_at) return { ok: false, reason: 'reused', familyId: row.family_id };

  if (row.expires_at.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  await tx.query('update auth.refresh_tokens set used_at = now() where id = $1', [row.id]);
  return { ok: true, userId: row.user_id, familyId: row.family_id };
}

export async function issueRefreshToken(
  tx: pg.PoolClient,
  userId: string,
  familyId: string,
  userAgent?: string,
): Promise<string> {
  const token = newRefreshToken();
  await tx.query(
    `insert into auth.refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent)
     values ($1, $2, $3, now() + ($4 || ' days')::interval, $5)`,
    [userId, hashToken(token), familyId, String(REFRESH_TTL_DAYS), userAgent ?? null],
  );
  return token;
}

export async function revokeFamily(tx: pg.PoolClient, familyId: string): Promise<void> {
  await tx.query(
    `update auth.refresh_tokens set revoked_at = now()
      where family_id = $1 and revoked_at is null`,
    [familyId],
  );
}

export { safeEqual };
