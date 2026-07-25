#!/usr/bin/env node
/**
 * Applies SQL migrations, and optionally the seed, to the configured database.
 *
 *   node scripts/db.mjs migrate   apply every migration not yet recorded
 *   node scripts/db.mjs seed      apply seed.sql (development only)
 *   node scripts/db.mjs reset     drop schemas, re-migrate, re-seed
 *
 * Migrations run as kv_migrator (MIGRATION_DATABASE_URL): DDL requires an owner, and
 * the runtime role kv_api deliberately cannot create tables. See ADR-0003.
 *
 * Applied migrations are recorded in public.schema_migrations, so `migrate` is safe to
 * run repeatedly. The seed is NOT idempotent — it uses fixed primary keys for some
 * tables but plain inserts for content, so running it twice duplicates agenda items and
 * news. Use `reset` to re-seed.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../src/db/migrations');
const seedFile = join(here, '../src/db/seed.sql');

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function ensureTable() {
  await client.query(`
    create table if not exists public.schema_migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);
}

async function migrate() {
  await ensureTable();
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await client.query('select name, checksum from public.schema_migrations');
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));

  let ran = 0;
  for (const name of files) {
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);

    if (applied.has(name)) {
      if (applied.get(name) !== checksum) {
        // Editing an applied migration means the database and the file disagree, which
        // is how schema drift starts. Fail loudly rather than silently skipping.
        console.error(`\n  ${name} has changed since it was applied.`);
        console.error('  Add a new migration instead, or run `reset` in development.\n');
        process.exit(1);
      }
      continue;
    }

    process.stdout.write(`  applying ${name} ... `);
    // Each migration is one transaction: a failure leaves nothing half-applied.
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(
        'insert into public.schema_migrations (name, checksum) values ($1, $2)',
        [name, checksum],
      );
      await client.query('commit');
      console.log('ok');
      ran += 1;
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`\n  ${err.message}\n`);
      process.exit(1);
    }
  }
  console.log(ran === 0 ? '  already up to date' : `  ${ran} migration(s) applied`);
}

async function seed() {
  const sql = await readFile(seedFile, 'utf8');
  process.stdout.write('  seeding ... ');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log('ok');
  } catch (err) {
    await client.query('rollback');
    console.log('FAILED');
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  }
}

async function reset() {
  console.log('  dropping schemas ...');
  // auth and public are both recreated by the migrations; the roles and extensions
  // created by the container's init script survive, since they are database-level.
  await client.query('drop schema if exists public cascade');
  await client.query('drop schema if exists auth cascade');
  await client.query('create schema public');
  await client.query('create schema auth');
  await migrate();
  await seed();
}

const command = process.argv[2] ?? 'migrate';
await client.connect();
try {
  if (command === 'migrate') await migrate();
  else if (command === 'seed') await seed();
  else if (command === 'reset') await reset();
  else {
    console.error(`Unknown command: ${command}. Use migrate | seed | reset.`);
    process.exit(1);
  }
} finally {
  await client.end();
}
