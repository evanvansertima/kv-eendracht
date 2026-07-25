---
title: ADR-0001 — Own API on plain Postgres instead of Supabase
project: kv-eendracht
status: accepted
date: 2026-07-25
supersedes: v1 backend choice
tags: [adr, architecture, backend, docker, postgres]
updated: 2026-07-25
---

# ADR-0001 — Own API on plain Postgres instead of Supabase

## Status

Accepted, 2026-07-25. Supersedes the backend choice recorded in
[[ARCHITECTURE-v1-supabase]] and [[KV-EENDRACHT-APP-SPEC#2. Tech stack and versions]].

## Context

v1 runs on Supabase Cloud: managed Postgres plus GoTrue (auth), PostgREST (data),
Storage and Realtime. It works, and it got the club to a running app quickly.

The requirement has since changed: **the infrastructure must be containerized in Docker**.
Supabase Cloud is a managed vendor service and cannot be containerized at all. That leaves
three options:

1. Self-host the official Supabase Docker stack (~10 containers: kong, gotrue, postgrest,
   realtime, storage, imgproxy, meta, studio, analytics, vector).
2. Build our own API against a plain Postgres container.
3. Stay on Supabase Cloud and containerize only the frontend.

Option 3 does not meet the requirement. Option 1 meets it but drags in a large operational
surface — ten containers, coupled version upgrades, and a self-hosting story that is
noticeably less polished than the hosted product — for a club app with a few hundred users.

## Decision

Build our own TypeScript API (NestJS on Fastify, Drizzle for queries) in front of a stock
`postgres:17` container. Replace the three Supabase services we actually use:

| Supabase service | Replacement |
|---|---|
| GoTrue | Own JWT issuance, Argon2id hashing — see [[ADR-0003-keep-rls-as-the-authorization-layer]] |
| PostgREST | Explicit REST endpoints with an OpenAPI contract |
| Storage | MinIO — see [[ADR-0006-minio-for-object-storage]] |
| Realtime | `pg_notify` + WebSocket — see [[ADR-0005-websocket-for-realtime]] |

## What made this affordable

The deciding factor was measuring, rather than assuming, how tightly the SQL is bound to
Supabase. The coupling is shallow:

| Supabase-specific construct | Occurrences in ~1.400 lines of SQL |
|---|---|
| `auth.uid()` | 43 |
| `auth.users` | 3 (one FK, one trigger, one trigger target) |
| `auth.email()` | 1 |
| `storage.objects` policies | 5 |
| `alter publication supabase_realtime` | 3 lines |
| Non-standard extensions | `pgcrypto` only, which ships in every Postgres image |

Decisively, **no policy uses a `TO <role>` clause**. Every policy is a plain `USING` /
`WITH CHECK` expression over `auth.uid()` and the `public.is_admin()` helper family. So the
port needs no Postgres role engineering — only an `auth` schema providing `auth.users`,
`auth.uid()` and `auth.email()`. With that shim in place the existing migrations run on
stock Postgres essentially unchanged.

The pure domain layer (`packages/domain`, 1.407 lines covering draws, brackets, poules,
Sneker telling and standings) has no backend imports at all by construction — see
[[KV-EENDRACHT-APP-SPEC#12. Conventions and guardrails]] rule 1 — so it moves across
untouched.

## Consequences

**Good**

- Runs anywhere Docker runs; hosting stays an open choice.
- Five containers instead of ten.
- No vendor lock-in and no per-seat pricing as the club grows.
- Owning Postgres finally makes RLS policies testable in CI, closing the gap logged in
  [[KV-EENDRACHT-APP-SPEC#13. Testing]].
- The migration drift recorded in [[KV-EENDRACHT-APP-SPEC#15. Known limitations, drift and roadmap]]
  disappears: there is no dashboard SQL editor to hand-patch production from.

**Bad**

- We now own auth. Password reset, token rotation, and anonymous sessions are our code and
  our security responsibility, where GoTrue was audited and maintained by someone else.
- We now own backups, TLS renewal and upgrades.
- More code than option 1: an API layer that PostgREST previously generated for free.

**Mitigations**

- Auth uses boring, well-trodden building blocks: Argon2id, short-lived access tokens,
  rotating refresh tokens. No custom cryptography.
- Backups are automated from day one, with a documented and rehearsed restore drill, rather
  than left to phase 6 — see [[INFRA]].

## Related

- [[ADR-0002-react-native-on-all-platforms]]
- [[ADR-0003-keep-rls-as-the-authorization-layer]]
- [[ADR-0004-pnpm-monorepo]]
- [[INFRA]] · [[API]] · [[DATABASE]]
