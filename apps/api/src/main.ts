import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { closePool } from './db.ts';

/**
 * Entry point. Everything about how the API is assembled lives in app.ts, so tests can
 * build the same instance without opening a port.
 */

// Node reads .env natively; no dotenv dependency needed.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // Absent in production, where the environment is supplied by the container.
}

const config = loadConfig();
const app = await buildApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await closePool();
    process.exit(0);
  });
}

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
