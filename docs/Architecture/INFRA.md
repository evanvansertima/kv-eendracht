---
title: Infrastructure — containers, environments, backups
project: kv-eendracht
status: planned
tags: [infra, docker, compose, caddy, minio, backup, operations]
updated: 2026-07-25
---

# Infrastructure

> Container topology for the Dockerized rebuild. Rationale in
> [[ADR-0001-own-api-instead-of-supabase]].

## Services

| Service | Image | Dev | Prod | Purpose |
|---|---|---|---|---|
| `postgres` | `postgres:17-alpine` | ✅ | ✅ | Data, RLS, RPCs |
| `api` | built | ✅ | ✅ | NestJS, see [[API]] |
| `app-web` | built | via Metro dev server | static export behind Caddy | The web target of [[ADR-0002-react-native-on-all-platforms]] |
| `minio` | `minio/minio` | ✅ | ✅ | Object storage, see [[ADR-0006-minio-for-object-storage]] |
| `minio-init` | `minio/mc` | ✅ | ✅ | Creates the three buckets, then exits |
| `mailpit` | `axllent/mailpit` | ✅ | — | Captures outbound mail so password reset is testable offline |
| `adminer` | `adminer` | ✅ | — | Ad-hoc SQL, replacing Supabase Studio |
| `caddy` | `caddy:alpine` | — | ✅ | Automatic TLS, reverse proxy, WebSocket upgrade |
| `backup` | `postgres:17-alpine` | — | ✅ | Nightly `pg_dump` + bucket mirror |

Development and production share `docker-compose.yml`; production applies
`docker-compose.prod.yml` as an overlay which adds Caddy and the backup sidecar, drops Mailpit
and Adminer, and replaces development secrets with real ones.

```bash
# development
docker compose up -d

# production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Database roles

Three roles, and the distinction is load-bearing rather than ceremonial:

| Role | Rights | Used by |
|---|---|---|
| `kv_owner` | owns the database | bootstrap only |
| `kv_migrator` | owns tables, runs DDL | migrations |
| `kv_api` | DML only, **not** superuser, **not** `BYPASSRLS` | the API at runtime |

If the API ever connects as a superuser or a `BYPASSRLS` role, **every RLS policy is silently
skipped** and the entire authorization model in
[[ADR-0003-keep-rls-as-the-authorization-layer]] evaporates with no error and no log line.
This is the single most important configuration item in the stack, and the RLS test suite
asserts it explicitly rather than trusting it.

## Configuration

Secrets come from the environment, never the image, and never the repository. `.env.example`
documents every variable with a safe development default; `.env` is gitignored.

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD`, `DATABASE_URL` | `DATABASE_URL` uses the `kv_api` role |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | distinct values, ≥ 32 random bytes |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | |
| `SMTP_*` | Mailpit in dev, a real relay in prod |
| `PUBLIC_API_URL`, `CORS_ORIGINS` | |
| `EXPO_PUBLIC_API_URL` | the only variable reaching the client bundle |

Only `EXPO_PUBLIC_*` values are compiled into the app. Anything else placed there is public —
this is the same discipline as rule 6 of [[CLAUDE]], with new variable names.

## Health and startup order

Every service declares a healthcheck, and dependants use `condition: service_healthy`.
Postgres in particular reports ready twice during its first boot — once while running its own
init scripts — so `pg_isready` alone is not sufficient for first-run correctness; the API
retries migrations on startup rather than assuming the database is reachable on first attempt.

## Backups

Nightly, from day one rather than deferred:

1. `pg_dump -Fc` to a timestamped file.
2. MinIO bucket mirror.
3. Both pushed off-site (restic to any S3-compatible target).
4. 7 daily, 4 weekly, 6 monthly retention.

**A backup that has never been restored is not a backup.** The restore drill is documented as
a runnable procedure against a scratch container, and rehearsing it is a release checklist item
before the club depends on the system.

## Hosting

Deliberately unpinned — the stack runs the same on a VPS, a NAS or a PaaS, which is much of
the point of containerizing. Practical notes when the choice is made:

- **VPS** (Hetzner, DigitalOcean, TransIP) — the default assumption. Caddy obtains
  certificates automatically; open only 80 and 443. Roughly €5–10/month.
- **NAS or mini-PC at the club** — free, but needs dynamic DNS, port forwarding, and someone
  who notices when it stops.
- **PaaS** (Fly.io, Railway, Render) — push the same images; managed Postgres and TLS replace
  the `postgres`, `caddy` and `backup` services, and MinIO is swapped for the provider's object
  storage. The S3 API compatibility chosen in [[ADR-0006-minio-for-object-storage]] is what
  makes that swap a configuration change.

## CI/CD

GitHub Actions on `git@github.com:evanvansertima/kv-eendracht.git`:

1. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter domain verify`
2. API integration and RLS tests against a Postgres service container
3. Build and publish images to GHCR, tagged by commit SHA
4. Deploy on a tag

Mobile builds go through EAS, which is separate from the container pipeline — the App Store
and Play Store have their own cadence.

## Related

- [[ARCHITECTURE]] · [[API]] · [[DATABASE]]
- [[ADR-0004-pnpm-monorepo]] — why the working copy lives outside iCloud Drive
