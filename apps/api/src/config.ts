import { z } from 'zod';

/**
 * Environment validation. Fails fast and loudly at startup rather than producing a
 * confusing error on the first request that happens to need a missing value.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Runtime connection. MUST be the kv_api role: it is neither superuser nor
  // BYPASSRLS, which is the only reason RLS applies to the API at all. Pointing this
  // at kv_owner disables every policy in the system silently. See ADR-0003.
  DATABASE_URL: z.string().url(),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8081')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env.`);
  }
  return parsed.data;
}
