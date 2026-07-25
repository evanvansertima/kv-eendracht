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
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate && pnpm db:seed
pnpm dev
```

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

## GitHub setup

The remote is `git@github.com:evanvansertima/kv-eendracht.git`. GitHub's host keys are already
trusted, but **the SSH key on this machine is not yet registered on the account**, so pushes
fail with `Permission denied (publickey)`.

To fix, add this public key at GitHub → Settings → SSH and GPG keys → New SSH key:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEAemcrJOyl2i/Lq91/78lIBiDTxqEQUgRiIzN5PP9iO eserti@Evans-Mac.local
```

Then verify:

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
