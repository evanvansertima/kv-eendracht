import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.ts';
import { registerRoutes } from './routes.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import { registerGameRoutes } from './games/routes.ts';
import { attachClaims } from './auth/middleware.ts';
import { closePool } from './db.ts';

// Node reads .env natively; no dotenv dependency needed.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // Absent in production, where the environment is supplied by the container.
}

const config = loadConfig();

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
  },
});

await app.register(cors, {
  origin: config.CORS_ORIGINS,
  credentials: true,
});

// Resolves the bearer token into req.claims for every route. It never rejects: a public
// read with no token is valid, and RLS decides what it may see.
app.addHook('preHandler', attachClaims(config.JWT_SECRET));

registerAuthRoutes(app, config);
registerGameRoutes(app, config);
registerRoutes(app, config);

app.setErrorHandler((err: FastifyError, _req, reply) => {
  app.log.error(err);
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await closePool();
    process.exit(0);
  });
}

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
