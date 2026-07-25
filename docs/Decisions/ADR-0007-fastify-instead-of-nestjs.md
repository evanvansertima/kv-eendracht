---
title: ADR-0007 — Fastify instead of NestJS for the API
project: kv-eendracht
status: accepted
date: 2026-07-25
amends: ADR-0001
tags: [adr, api, fastify, nestjs, typescript, tooling]
updated: 2026-07-25
---

# ADR-0007 — Fastify instead of NestJS for the API

## Status

Accepted, 2026-07-25. Amends the framework choice in
[[ADR-0001-own-api-instead-of-supabase]], which specified NestJS. Everything else in that
decision stands.

## Context

[[ADR-0001-own-api-instead-of-supabase]] chose NestJS on Fastify, reasoning that its module
structure would keep eleven feature areas navigable and that interceptors were the right
shape for the RLS transaction wrapper. Both points were fair.

Building it surfaced a constraint that was not considered at decision time.

**NestJS depends on decorator metadata.** Its dependency injection resolves constructor
parameters at runtime by reading types that TypeScript emits under
`emitDecoratorMetadata`. That is a *transform*, not a type annotation — it generates code
that must exist at runtime.

Node's native type stripping (`--experimental-strip-types`, used throughout this repository
including `packages/domain`) does exactly what its name says: it removes type annotations
and emits nothing. It cannot produce decorator metadata. So NestJS requires a full compile
step — tsc or SWC — in watch mode during development and as a build stage in the
Dockerfile.

That is not fatal, but it buys a slower feedback loop and a second toolchain for a club
application maintained by essentially one person.

## Decision

Use **Fastify directly**, with no framework on top.

The RLS transaction wrapper — the one thing NestJS interceptors were specifically wanted
for — is a plain higher-order function, `withRls` in `apps/api/src/db.ts`. It is arguably
clearer than an interceptor: the transaction boundary is visible at the call site rather
than configured elsewhere and applied invisibly.

What is lost, honestly:

- **Dependency injection.** With eleven small modules over one database, plain imports are
  adequate. If the API grows a genuine need for swappable implementations, this decision
  should be revisited rather than worked around.
- **Automatic OpenAPI from decorators.** `@fastify/swagger` with `fastify-type-provider-zod`
  produces the same specification from the Zod schemas already living in
  `packages/contracts`, so the contract stays single-sourced either way.
- **Imposed structure.** NestJS makes one layout obvious to any Nest developer. Without it,
  the module boundaries in [[API]] have to be maintained by discipline.

What is gained: `node --experimental-strip-types src/main.ts` runs the API with no build
step, the same way `packages/domain` runs its tests, and the production image needs no
compile stage.

## Consequences

- [[API]] must be updated: its stack table names NestJS, and its request-lifecycle section
  describes guards and interceptors rather than Fastify hooks.
- The eleven modules in [[API]] become directories of plain route handlers registered as
  Fastify plugins. The boundaries are unchanged.
- Authorization is unaffected. It never depended on the framework — it depends on
  connecting as `kv_api` and setting transaction-local claims, per
  [[ADR-0003-keep-rls-as-the-authorization-layer]].

## Why this is recorded rather than just done

The framework was named in an approved decision. Changing it quietly would leave the
documentation describing a system that does not exist, which is precisely the drift
[[KV-EENDRACHT-APP-SPEC#15. Known limitations, drift and roadmap]] logs as a problem in v1.
A superseding record costs one file and keeps the documents trustworthy.

## Related

- [[ADR-0001-own-api-instead-of-supabase]] · [[API]] · [[ARCHITECTURE]]
