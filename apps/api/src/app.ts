import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { ZodError } from 'zod';
import type { Config } from './config.ts';
import { registerRoutes } from './routes.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import { registerGameRoutes } from './games/routes.ts';
import { registerTournamentRoutes } from './tournaments/routes.ts';
import { registerContentRoutes } from './content/routes.ts';
import { registerCommunityRoutes } from './community/routes.ts';
import { registerStorageRoutes } from './storage/routes.ts';
import { registerInschrijvingRoutes } from './inschrijving/routes.ts';
import { attachClaims } from './auth/middleware.ts';

/**
 * Builds the API without starting a listener.
 *
 * Split out of main.ts so tests can drive real routes through app.inject() — no port,
 * no network, but the actual guards, validation and error translation. Route-level
 * regressions (a guard that rejects the wrong thing) are invisible to SQL-only tests,
 * and that is exactly the class of bug that has bitten here.
 */
export async function buildApp(config: Config, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            transport:
              config.NODE_ENV === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
                  }
                : undefined,
          },
  });

  await app.register(cors, { origin: config.CORS_ORIGINS, credentials: true });

  // Form-encoded bodies. Payment providers post their return and webhook callbacks as
  // application/x-www-form-urlencoded at least as often as JSON, and without this
  // Fastify answers 415 before any handler runs.
  await app.register(formbody);

  // Resolves the bearer token into req.claims for every route. It never rejects: a
  // public read with no token is valid, and RLS decides what it may see.
  app.addHook('preHandler', attachClaims(config.JWT_SECRET));

  registerAuthRoutes(app, config);
  registerGameRoutes(app, config);
  registerTournamentRoutes(app, config);
  registerContentRoutes(app, config);
  registerCommunityRoutes(app, config);
  registerStorageRoutes(app, config);
  registerInschrijvingRoutes(app, config);
  registerRoutes(app, config);

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    app.log.error(err);

    // A failed Zod parse is the user's input being wrong, not the server breaking.
    //
    // Without this it fell through as a 500, and the 5xx branch below deliberately
    // hides the message — so every Dutch validation message written into the schemas
    // ("Gebruik het formaat JJJJ-MM-DD", "Een partuur bestaat uit minimaal 2 spelers")
    // was replaced by a generic server error and never reached anyone.
    if (err instanceof ZodError) {
      const first = err.issues[0];
      reply.status(400).send({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: first?.message ?? 'De ingevoerde gegevens zijn niet geldig.',
        // Which field, for a client that wants to highlight it.
        field: first?.path.join('.') || undefined,
      });
      return;
    }

    const status = err.statusCode ?? 500;
    // RFC 9457 problem+json, with Dutch detail suitable for direct display.
    //
    // A 5xx message is never echoed to the client: it can carry SQL fragments, table
    // names or connection strings. Client errors (4xx) are our own validation messages,
    // already written in Dutch for the user.
    reply.status(status).send({
      type: 'about:blank',
      title: status < 500 ? err.name : 'Internal Server Error',
      status,
      detail:
        status < 500 ? err.message : 'Er ging iets mis op de server. Probeer het later opnieuw.',
    });
  });

  return app;
}
