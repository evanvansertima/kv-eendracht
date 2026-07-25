import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Claims } from '../db.ts';
import { verifyAccessToken } from './tokens.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Null for an unauthenticated visitor — the normal case for public reads. */
    claims: Claims | null;
  }
}

/**
 * Resolves the bearer token into claims and hangs them on the request.
 *
 * This does NOT reject anything. Authentication and authorization are separate concerns:
 * a public read with no token is perfectly valid, and RLS decides what it may see. The
 * `requireAuth` / `requireRole` guards below handle refusal where it matters.
 */
export function attachClaims(secret: string) {
  return async function (req: FastifyRequest): Promise<void> {
    req.claims = null;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    req.claims = await verifyAccessToken(header.slice(7), secret);
  };
}

class HttpError extends Error {
  statusCode: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = status === 401 ? 'Unauthorized' : 'Forbidden';
    this.statusCode = status;
  }
}

/** Requires any session, anonymous included. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.claims) throw new HttpError(401, 'Je moet ingelogd zijn voor deze actie.');
}

/**
 * Requires a staff role.
 *
 * This is navigation comfort and a clear error message — **not** the security boundary.
 * RLS is. A handler that forgot this guard is still refused by the database, which is
 * exactly the property ADR-0003 exists to preserve. Never rely on this alone.
 */
export function requireRole(...allowed: string[]) {
  return async function (req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!req.claims) throw new HttpError(401, 'Je moet ingelogd zijn voor deze actie.');
    if (!req.claims.role || !allowed.includes(req.claims.role)) {
      throw new HttpError(403, 'Je hebt geen rechten voor deze actie.');
    }
  };
}

export { HttpError };
