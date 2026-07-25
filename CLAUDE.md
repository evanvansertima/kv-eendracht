---
title: CLAUDE.md — project rules
project: kv-eendracht
status: current
tags: [rules, conventions, claude, guardrails]
updated: 2026-07-25
---

# CLAUDE.md — KV Eendracht

Fixed project rules. Do not deviate without updating this file in the same commit.

**Read first in any new session:** [[KV-EENDRACHT-APP-SPEC]] for what the app does,
[[ARCHITECTURE]] for how it is built. File paths are authoritative — when a document and the
code disagree, the code wins and the document is corrected in the same commit.

## Project

Cross-platform application for Kaatsvereniging KV Eendracht, a Frisian handball club.
Targets iOS, Android and web from one React Native codebase; infrastructure runs in Docker.

- App name: **KV Eendracht** · bundle id / package: `nl.kveendracht.app`
- Deep link scheme: `kveendracht://`
- UI language **Dutch** (`nl-NL`), timezone `Europe/Amsterdam`, 24-hour clock
- Code, comments and documentation in **English**, except kaats domain terms

## Stack (fixed)

**Monorepo** — pnpm workspaces + Turborepo. `.npmrc` sets `node-linker=hoisted`; without it
Metro cannot resolve pnpm's symlinks and Expo fails to start.

| Workspace | Stack |
|---|---|
| `apps/api` | NestJS 11 on Fastify, Drizzle, Zod, Pino |
| `apps/app` | Expo SDK 54, Expo Router, React Native, TanStack Query, Zustand, RHF + Zod |
| `packages/domain` | Pure TypeScript. No framework imports of any kind |
| `packages/contracts` | Zod schemas + generated API client |

TypeScript **strict** everywhere. No additional state managers. No third-party package where
Expo, React Native or Nest ships an equivalent. Align versions with `npx expo install --fix`
after any dependency change.

## Architecture rules

1. **Domain logic is pure.** All draw, match and standings logic lives in `packages/domain` as
   pure, seedable functions with no React, Expo or backend imports. ESLint
   `no-restricted-imports` enforces this.
2. **No `Math.random()` in domain code.** Use `createRng` with a stored seed, or draws stop
   being reproducible. ESLint `no-restricted-properties` enforces this.
3. **Server state belongs to TanStack Query**, never Zustand. Zustand holds only UI state:
   display name, filters, offline flags.
4. **Standings are computed in the database** by `recalculate_standings`. The client displays.
   Changing sort rules means changing the RPC, the view, `packages/domain/competitie/standings.ts`
   and the tests **in one commit** — see [[Telling-en-standen]].
5. **Security is RLS.** Postgres policies are the only authorization layer; the API is subject
   to them, not privileged above them. Hiding a button is never security. New tables require
   policies in the same migration. See [[ADR-0003-keep-rls-as-the-authorization-layer]].
6. **The API connects as `kv_api`** — never a superuser, never `BYPASSRLS`. Violating this
   silently disables every policy in the system with no error.
7. **Secrets.** Only `EXPO_PUBLIC_*` variables may reach the client bundle, and everything
   placed there is public. Database credentials, JWT secrets and MinIO keys are server-side
   only and never committed.
8. **Dates.** Store `timestamptz` in UTC; render exclusively through `src/lib/dates.ts`. Never
   format a date by hand.
9. **Idempotency.** Every result mutation carries a `client_mutation_id`.
10. **Soft delete.** Anything that can appear in historical results is archived, never deleted.
11. **Accessibility.** Every tappable element ≥ 44×44 pt with `accessibilityRole` and
    `accessibilityLabel`; all figures use `fontVariant: ['tabular-nums']`.
12. **Design tokens.** No hard-coded colours in screens — import from `src/theme/tokens.ts`.
13. **Language.** All user-facing copy is Dutch. Kaats terms (partuur, eersten, omloop, perk,
    staand nummer) stay Dutch in code and identifiers **on purpose** — see
    [[Kaatsen-glossarium]].

## Layout

```
apps/api/      NestJS — modules, SQL migrations, Drizzle schema, RLS interceptor
apps/app/      Expo Router — routes (thin), features, components, lib, theme, stores
packages/      domain (pure logic) · contracts (Zod + client) · shared configs
infra/         docker-compose, Caddy, backup
docs/          all documentation; synced to Obsidian with `pnpm docs:sync`
```

## Style

- Sport headings in Barlow Condensed (ExtraBold / Black Italic); body text in Inter.
- Tabular numerals for every figure in standings and results.
- Status labels: LIVE (red), BINNENKORT (gold), AFGELOPEN (grey).
- **No blank white areas.** Every data screen implements skeleton → content → empty state →
  error state, plus an offline banner with a "last updated" time.

## Quality gates (after every change)

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm --filter domain verify
```

`pnpm --filter domain verify` runs 17 dependency-free checks including the N = 2…100 partition
sweep. **It must stay at 17/17.** Fix failures before continuing; record progress in
[[PROJECT_PLAN]].

## Core domain rules (do not change without updating tests)

- A regular partij is won at **6 eersten**.
- KNKB poule: winner 7 points, loser scores its own eersten; tiebreak fewest eersten tegen →
  head-to-head → configurable.
- D.E.L. partition for N players: smallest **even** T with `ceil(N/3) ≤ T ≤ floor(N/2)`;
  triples `x = N − 2T`, pairs `y = 3T − N`. Unsolvable only for N = 2, 3 and 7.
- ABC partuur (strict): exactly one A, one B and one C; largest **even** number of complete
  parturen; the remainder appears on the reserve list **with a reason**.
- Standings sort: eersten voor ↓, eersten tegen ↑, saldo ↓, deelnames ↓, name ↑.
- The partuur with the lowest match number serves first and is the red side.
- Attendance: automatic on result entry; absent only on "Speelavond afronden"; at most one
  count per player per night; every correction audited.

Details: [[Lotingsvormen]] · [[Telling-en-standen]]
