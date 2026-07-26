import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import {
  ACCESS_TTL_SECONDS,
  consumeRefreshToken,
  dummyVerify,
  hashPassword,
  hashToken,
  issueRefreshToken,
  newRefreshToken,
  revokeFamily,
  signAccessToken,
  verifyPassword,
} from './tokens.ts';
import { HttpError, requireAuth } from './middleware.ts';

const loginSchema = z.object({
  email: z.string().email('Vul een geldig e-mailadres in.'),
  password: z.string().min(1, 'Vul je wachtwoord in.'),
});

const anonSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(2, 'Kies een schermnaam van minimaal 2 tekens.')
    .max(32, 'Een schermnaam mag maximaal 32 tekens bevatten.'),
});

const refreshSchema = z.object({ refresh_token: z.string().min(1) });

type Session = { access_token: string; refresh_token: string; expires_in: number };

/**
 * Auth routes.
 *
 * These run OUTSIDE any user's RLS context by design — a login has no session yet, so
 * there are no claims to set. `withRls(..., null, ...)` is therefore correct here and
 * only here; every other module passes `req.claims`.
 */
export function registerAuthRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null = null) =>
    withRls(config.DATABASE_URL, claims, fn);

  async function buildSession(
    tx: Parameters<Parameters<typeof withRls>[2]>[0],
    userId: string,
    familyId: string,
    userAgent: string | undefined,
  ): Promise<Session> {
    // auth.users is deny-by-default under RLS and kv_api has no direct grant on it.
    // Everything goes through the SECURITY DEFINER helpers in 0006_auth_access.sql.
    const { rows } = await tx.query<{
      role: string;
      email: string | null;
      is_anonymous: boolean;
    }>('select role, email, is_anonymous from auth.session_claims($1)', [userId]);
    const profile = rows[0];
    if (!profile) throw new HttpError(401, 'Account niet gevonden.');

    const claims: Claims = {
      sub: userId,
      role: profile.role,
      email: profile.email ?? undefined,
      is_anonymous: profile.is_anonymous,
    };

    return {
      access_token: await signAccessToken(claims, config.JWT_SECRET),
      refresh_token: await issueRefreshToken(tx, userId, familyId, userAgent),
      expires_in: ACCESS_TTL_SECONDS,
    };
  }

  // ---------------------------------------------------------------- login
  app.post('/v1/auth/login', async (req) => {
    const body = loginSchema.parse(req.body);

    return db(async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        password_hash: string | null;
        is_anonymous: boolean;
      }>('select id, password_hash, is_anonymous from auth.find_login($1)', [body.email]);
      const user = rows[0];

      // Verify against a throwaway hash when the account does not exist, so a missing
      // email costs the same time as a wrong password. Otherwise the response time
      // reveals which addresses are registered.
      if (!user?.password_hash || user.is_anonymous) {
        await dummyVerify(body.password);
        throw new HttpError(401, 'E-mailadres of wachtwoord klopt niet.');
      }

      if (!(await verifyPassword(body.password, user.password_hash))) {
        throw new HttpError(401, 'E-mailadres of wachtwoord klopt niet.');
      }

      await tx.query('select auth.record_sign_in($1)', [user.id]);
      return buildSession(tx, user.id, randomUUID(), req.headers['user-agent']);
    });
  });

  // ---------------------------------------------------------------- anonymous
  //
  // The community path from spec section 5: no email, no password, just a chosen display
  // name. The handle_new_user trigger creates the matching profile, and everything that
  // account later posts starts in the moderation queue.
  app.post('/v1/auth/anonymous', async (req) => {
    const body = anonSchema.parse(req.body);

    return db(async (tx) => {
      const { rows } = await tx.query<{ create_anonymous: string }>(
        'select auth.create_anonymous($1) as create_anonymous',
        [body.display_name],
      );
      return buildSession(tx, rows[0]!.create_anonymous, randomUUID(), req.headers['user-agent']);
    });
  });

  // ---------------------------------------------------------------- refresh
  app.post('/v1/auth/refresh', async (req) => {
    const body = refreshSchema.parse(req.body);

    const outcome = await db(async (tx) => {
      const result = await consumeRefreshToken(tx, body.refresh_token);
      if (!result.ok) return result;
      return {
        ok: true as const,
        session: await buildSession(tx, result.userId, result.familyId, req.headers['user-agent']),
      };
    });

    if (outcome.ok) return outcome.session;

    // Revoke in a SEPARATE, committed transaction. Doing it inside the transaction above
    // and then throwing would roll the revocation back, leaving the stolen family usable
    // — which is precisely the attack this is meant to stop.
    if (outcome.reason === 'reused') {
      await db((tx) => revokeFamily(tx, outcome.familyId));
      req.log.warn({ familyId: outcome.familyId }, 'refresh token reuse detected; family revoked');
    }

    // Every failure reads the same to the client: log in again.
    throw new HttpError(401, 'Je sessie is verlopen. Log opnieuw in.');
  });

  // ---------------------------------------------------------------- logout
  app.post('/v1/auth/logout', async (req) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return { ok: true };

    await db(async (tx) => {
      const { rows } = await tx.query<{ family_id: string }>(
        'select family_id from auth.refresh_tokens where token_hash = $1',
        [hashToken(parsed.data.refresh_token)],
      );
      // Revoke the whole family, not just this token: logging out on one device should
      // not leave a still-valid descendant behind.
      if (rows[0]) await revokeFamily(tx, rows[0].family_id);
    });

    return { ok: true };
  });

  // ---------------------------------------------------------------- me
  app.get('/v1/auth/me', { preHandler: requireAuth }, async (req) => {
    const userId = req.claims!.sub;
    return db(async (tx) => {
      // Two reads rather than a join: profiles is readable under RLS (own row), but
      // auth.users is not, so the email comes from the SECURITY DEFINER helper.
      const [claims, profile] = await Promise.all([
        tx.query<{ role: string; email: string | null; is_anonymous: boolean }>(
          'select role, email, is_anonymous from auth.session_claims($1)',
          [userId],
        ),
        tx.query<{ display_name: string; match_entry_rights: boolean }>(
          'select display_name, match_entry_rights from public.profiles where id = $1',
          [userId],
        ),
      ]);

      const c = claims.rows[0];
      const p = profile.rows[0];
      if (!c || !p) throw new HttpError(401, 'Account niet gevonden.');

      // The linked player record, if this account has one. Null for most accounts:
      // players and logins are separate, and only a linked account can register itself
      // for a wedstrijd.
      const player = await tx.query<{ my_player_id: string | null }>(
        'select public.my_player_id() as my_player_id',
      );

      return {
        id: userId,
        display_name: p.display_name,
        role: c.role,
        email: c.email,
        is_anonymous: c.is_anonymous,
        match_entry_rights: p.match_entry_rights,
        player_id: player.rows[0]?.my_player_id ?? null,
      };
    }, req.claims);
  });

  // ---------------------------------------------------------------- password reset
  //
  // Always reports success. Confirming whether an address is registered is an account
  // enumeration leak, and this endpoint is unauthenticated.
  app.post('/v1/auth/forgot-password', async (req) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);

    await db(async (tx) => {
      const { rows } = await tx.query<{ find_resettable: string | null }>(
        'select auth.find_resettable($1) as find_resettable',
        [body.email],
      );
      const userId = rows[0]?.find_resettable;
      if (!userId) return;

      const token = newRefreshToken();
      await tx.query(
        `insert into auth.password_resets (user_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 hour')`,
        [userId, hashToken(token)],
      );

      // TODO: send via SMTP (Mailpit in development). Logged at debug until then so the
      // flow is testable locally; this must not reach production logs.
      app.log.debug({ email: body.email, token }, 'password reset token issued');
    });

    return { ok: true };
  });

  app.post('/v1/auth/reset-password', async (req) => {
    const body = z
      .object({
        token: z.string().min(1),
        password: z.string().min(10, 'Kies een wachtwoord van minimaal 10 tekens.'),
      })
      .parse(req.body);

    await db(async (tx) => {
      const { rows } = await tx.query<{ id: string; user_id: string }>(
        `select id, user_id from auth.password_resets
          where token_hash = $1 and used_at is null and expires_at > now()`,
        [hashToken(body.token)],
      );
      const reset = rows[0];
      if (!reset) throw new HttpError(400, 'Deze herstellink is verlopen of al gebruikt.');

      await tx.query('select auth.set_password($1, $2)', [
        reset.user_id,
        await hashPassword(body.password),
      ]);
      await tx.query('update auth.password_resets set used_at = now() where id = $1', [reset.id]);

      // Changing a password must end every existing session — that is the whole point
      // when the reason for the reset is a suspected compromise.
      await tx.query(
        `update auth.refresh_tokens set revoked_at = now()
          where user_id = $1 and revoked_at is null`,
        [reset.user_id],
      );
    });

    return { ok: true };
  });
}
