# KV Eendracht

Cross-platform application for **Kaatsvereniging KV Eendracht**, a Frisian handball
(*kaatsen*) club. One React Native codebase targeting iOS, Android and web, backed by a
containerized TypeScript API and Postgres.

- **What it does** — `docs/Spec/KV-EENDRACHT-APP-SPEC.md`
- **How it is built** — `docs/Architecture/ARCHITECTURE.md`
- **Why** — `docs/Decisions/`
- **Rules before editing** — `CLAUDE.md`

The documentation is also an Obsidian vault. Open
`~/Library/Mobile Documents/com~apple~CloudDocs/Projecten/kv` and start at
*KV Eendracht — MOC*.

## Layout

```
apps/api/        NestJS on Fastify + Drizzle + Postgres
apps/app/        Expo Router → ios · android · web
packages/domain/ pure sport logic: draws, brackets, poules, Sneker, standings
packages/contracts/  Zod schemas + generated API client
infra/           docker-compose, Caddy, backups
docs/            documentation (source of truth for the Obsidian vault)
```

## Prerequisites

| Tool | Notes |
|---|---|
| Node 22+ | `node --version` |
| pnpm 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker | **Not currently installed.** Install [OrbStack](https://orbstack.dev) (lighter and faster on macOS) or Docker Desktop |

## Getting started

```bash
pnpm install
cp .env.example .env
```

Now open `.env` and replace every `<local-dev-password>` with a single password of your
choosing — at least 8 characters, which MinIO requires. One value covers Postgres and
MinIO, so there is only one credential to remember locally.

That is safe here and only here: RLS enforcement depends on **which role** you connect
as, never on the password, so `kv_api` sharing a password with `kv_owner` still leaves
`kv_api` without `BYPASSRLS`. Production uses a distinct secret per field, supplied from
the host environment.

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Local sign-ins, once the stack is up:

| Service | Username | Password |
|---|---|---|
| MinIO console | `kvadmin` | your `<local-dev-password>` |
| Adminer | `kv_owner`, server `postgres`, database `kv_eendracht` | your `<local-dev-password>` |
| Mailpit | no authentication | — |

> **Changing a database password later needs a volume reset.** Postgres reads
> `KV_MIGRATOR_PASSWORD` and `KV_API_PASSWORD` only when initialising an empty data
> directory. Edit them and restart, and nothing happens — worse, if the init script ever
> fails, Postgres reports *healthy* while missing every role. Run
> `docker compose --env-file .env -f infra/docker-compose.yml down -v` and start again.

| Surface | URL |
|---|---|
| Web app | http://localhost:8081 |
| API | http://localhost:3000/v1 |
| OpenAPI | http://localhost:3000/v1/openapi.json |
| Mailpit | http://localhost:8025 |
| MinIO console | http://localhost:9001 |
| Adminer | http://localhost:8080 |

Native: `pnpm --filter app ios` or `pnpm --filter app android`.

## Quality gates

Run after every change:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm --filter domain verify
```

`pnpm --filter domain verify` runs 17 dependency-free checks on the draw and standings maths,
including a sweep of every player count from 2 to 100. It must stay at 17/17.

## GitHub

The remote is `git@github.com:evanvansertima/kv-eendracht.git` over SSH. Verify access with:

```bash
ssh -T git@github.com
```

Expect `Hi evanvansertima! You've successfully authenticated`.

## Working copy location

The repository lives at `~/Developer/kv-eendracht` on local disk, deliberately **not** in
iCloud Drive. A monorepo's `node_modules` is large, and iCloud both syncs it continuously and
may evict files under "Optimise Mac Storage", causing build failures that look like
corruption. Only the Obsidian vault belongs in iCloud.

## Documentation sync

`docs/` in this repository is the source of truth. After editing:

```bash
pnpm docs:sync
```

This copies the documentation into the Obsidian vault. The sync is one-way — notes edited
directly in Obsidian are overwritten, so move anything worth keeping back into `docs/`.
