---
title: Project plan — Dockerized rebuild
project: kv-eendracht
status: in-progress
phase: 0
tags: [plan, progress, phases, roadmap]
updated: 2026-07-25
---

# Project plan — Dockerized rebuild

Progress log. Status: ✅ done · 🔄 in progress · ⬜ open · ⚠️ blocked

For the v1 phase log this follows on from, see [[PROJECT_PLAN-v1]].

## Context

v1 shipped as a complete Expo + Supabase Cloud application. v2 keeps the design and replaces
the foundation: containerized infrastructure, our own API, and a web target added to the
existing React Native codebase. Reasoning in
[[ADR-0001-own-api-instead-of-supabase]] and [[ADR-0002-react-native-on-all-platforms]].

## Phase 0 — Foundations 🔄

- ✅ Repository at `~/Developer/kv-eendracht`, `origin` set to
  `git@github.com:evanvansertima/kv-eendracht.git`
- ✅ GitHub host keys verified against published fingerprints and trusted
- ⚠️ **SSH key not yet registered on GitHub** — `Permission denied (publickey)`. Nothing can be
  pushed until the key is added to the account. See [[README]].
- ✅ Obsidian vault: MOC, 6 ADRs, architecture notes, domain notes, linked and tagged
- 🔄 Monorepo skeleton — pnpm workspaces, Turborepo, shared configs
- ⬜ `packages/domain` ported verbatim, 17/17 verification passing
- ⬜ `infra/docker-compose.yml` — postgres, minio, mailpit, adminer
- ⬜ GitHub Actions CI
- ⚠️ **Docker not installed on this machine** — `docker: command not found`. Install OrbStack
  or Docker Desktop; nothing in this phase can be verified until then.

## Phase 1 — Database ⬜

- ⬜ `0000_auth_shim.sql`: `auth` schema, `auth.users`, `auth.uid()`, `auth.email()`
- ⬜ Port the three v1 migrations, dropping only the storage and realtime blocks
- ⬜ `pg_notify` triggers on `matches`, `match_results`, `standings`
- ⬜ Three database roles: `kv_owner`, `kv_migrator`, `kv_api` — see [[INFRA]]
- ⬜ Port `seed.sql` with properly hashed accounts replacing the fake `auth.users` inserts
- ⬜ Drizzle schema mirroring the SQL
- ⬜ **RLS test suite** — the six invariants from
  [[KV-EENDRACHT-APP-SPEC#9. Row Level Security matrix]], closing the automation gap logged in
  [[KV-EENDRACHT-APP-SPEC#13. Testing]]

## Phase 2 — API ⬜

- ⬜ NestJS on Fastify; Pino, Helmet, CORS, rate limiting
- ⬜ Global JWT guard + RLS transaction interceptor
- ⬜ Auth: login, rotating refresh, logout, forgot/reset password, anonymous sign-in
- ⬜ Public reads: agenda, news, tournaments, competitions, standings, players, polls
- ⬜ OpenAPI + typed client generated into `packages/contracts`

Design: [[API]]

## Phase 3 — App on three platforms ⬜

- ⬜ Expo `web.output: 'static'`; `useBreakpoint`; tab bar on mobile, sidebar on desktop
- ⬜ Replace `src/lib/supabase.ts` with `src/lib/api.ts`, keeping every `src/features/**` hook
  signature identical so the 24 screens port with minimal edits
- ⬜ WebSocket client + query invalidation replacing the six Supabase channel subscriptions
- ⬜ Keep TanStack Query + persister, Zustand, RHF + Zod, theme tokens

## Phase 4 — Sport administration ⬜

- ⬜ Player admin, match nights, score entry, attendance, standings recalculation
- ⬜ Tournament builder with all six draw formats — see [[Lotingsvormen]]
- ⬜ Desktop layouts for admin screens, the main payoff of the web target
- ⬜ Idempotency verified end to end via `client_mutation_id`

## Phase 5 — Community ⬜

- ⬜ Forum, replies, likes, reports, moderation queue, polls
- ⬜ Photo upload via MinIO presigned URLs, resize to 1600 px, EXIF stripped
- ⬜ Rate limits, blocklist, feature kill switches (already present in the ported SQL)

## Phase 6 — Production and release ⬜

- ⬜ `docker-compose.prod.yml` + Caddy with automatic TLS; images to GHCR
- ⬜ Nightly `pg_dump` + bucket mirror off-site, **with a rehearsed restore drill**
- ⬜ Playwright E2E on the web build; Maestro smoke test on native
- ⬜ EAS build profiles, store submission, real logo and icons replacing placeholders
- ⬜ Push notifications: Expo Push on native, Web Push on web

## Decision log

Full records in the Decisions folder; summarised here for scanning.

| Date | Decision | Note |
|---|---|---|
| 2026-07-25 | Own API on plain Postgres, not self-hosted Supabase | [[ADR-0001-own-api-instead-of-supabase]] |
| 2026-07-25 | One React Native codebase for iOS, Android and web | [[ADR-0002-react-native-on-all-platforms]] |
| 2026-07-25 | Keep Postgres RLS as the only authorization layer | [[ADR-0003-keep-rls-as-the-authorization-layer]] |
| 2026-07-25 | pnpm monorepo with a shared domain package | [[ADR-0004-pnpm-monorepo]] |
| 2026-07-25 | WebSocket over `pg_notify` for live updates | [[ADR-0005-websocket-for-realtime]] |
| 2026-07-25 | MinIO for object storage | [[ADR-0006-minio-for-object-storage]] |
| 2026-07-25 | v1 scope carried over in full, including the community layer | this file |
| 2026-07-25 | Hosting left open; the stack must run identically anywhere | [[INFRA]] |

## Carried over from v1

Known limitations from [[KV-EENDRACHT-APP-SPEC#15. Known limitations, drift and roadmap]] and
their status under v2:

| Item | Status |
|---|---|
| Migration drift from dashboard patches | **Resolved by design** — no dashboard exists |
| RLS behaviour untested | **Scheduled in phase 1** — now testable, since we own Postgres |
| Placeholder logo and icons | Open, phase 6 |
| Vrije Formatie manual team entry | Open, phase 4 |
| Sneker rounds 2 and 3 drawn manually | Open, phase 4 |
| Seed `auth.users` unusable as logins | **Resolved by design** — we control the auth tables |
