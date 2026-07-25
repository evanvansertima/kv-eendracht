---
title: ADR-0004 — pnpm monorepo with a shared domain package
project: kv-eendracht
status: accepted
date: 2026-07-25
tags: [adr, tooling, monorepo, pnpm, turborepo]
updated: 2026-07-25
---

# ADR-0004 — pnpm monorepo with a shared domain package

## Status

Accepted, 2026-07-25.

## Context

After [[ADR-0001-own-api-instead-of-supabase]] there are two deployable applications — the API
and the Expo app — where v1 had one. They share more than they differ:

- **Domain logic.** Draw partitioning, bracket generation, poule scoring, Sneker telling and
  standings sorting. The client needs it for previews; the server needs it for validation.
  [[KV-EENDRACHT-APP-SPEC#10. Domain rules — draws, scoring, standings]] is explicit that the
  TypeScript standings module and the database RPC are mirrors that **must change together**.
- **API contracts.** Zod schemas describing every request and response.
- **Tooling.** TypeScript config, ESLint rules — including the purity rules that keep
  `domain/` free of React and backend imports.

Kept in separate repositories, these drift. Drift in domain logic means the preview a
volunteer sees during a draw disagrees with what the server stores.

## Decision

A single repository, pnpm workspaces for linking and Turborepo for task orchestration and
caching.

```
apps/
  api/          NestJS + Fastify + Drizzle
  app/          Expo Router → ios · android · web
packages/
  domain/       pure TypeScript logic + its Jest suites
  contracts/    Zod schemas + generated typed API client
  tsconfig/     shared TypeScript bases
  eslint-config/ shared lint rules incl. domain purity
```

`packages/domain` moves across from v1 **verbatim** — it has no framework imports by
construction, so nothing needs rewriting. Its dependency-free verification script
(`scripts/verify-domain.ts`, 17 checks including the N = 2…100 partition sweep) becomes the
regression guard proving the maths survived the move.

## Consequences

**Good**

- One version of the draw and standings rules, imported by both applications. The
  mirror-must-match rule becomes structurally enforced rather than a note in a document.
- One command runs every quality gate; Turborepo caches unchanged packages.
- A change to a Zod contract fails the API build and the app build in the same CI run.

**Bad**

- More setup than two plain projects, and Turborepo is another tool to understand.
- CI needs care so a change to `packages/domain` rebuilds both dependants.

## Known trap: pnpm and Expo

pnpm's default symlinked `node_modules` breaks the React Native Metro bundler, which does not
resolve symlinks the way Node does. The repository sets:

```
# .npmrc
node-linker=hoisted
```

This gives npm-style flat `node_modules` while keeping pnpm's workspace linking and fast,
space-efficient installs. Without it, `expo start` fails with confusing module-resolution
errors that look like missing dependencies.

## Repository location

The working copy lives at `~/Developer/kv-eendracht` on local disk, **not** in iCloud Drive.
A monorepo's `node_modules` is very large, and iCloud both syncs it continuously and may evict
files under "Optimise Mac Storage", producing build failures that look like corruption. Only
the Obsidian vault stays in iCloud, where sync is the point.

## Related

- [[ADR-0002-react-native-on-all-platforms]] — why one app package covers three platforms
- [[KV-EENDRACHT-APP-SPEC#12. Conventions and guardrails]] — the purity rules being enforced
- [[Lotingsvormen]] · [[Telling-en-standen]] — what lives in `packages/domain`
