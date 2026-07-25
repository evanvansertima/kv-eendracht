---
title: API design — KV Eendracht
project: kv-eendracht
status: planned
tags: [api, nestjs, fastify, auth, jwt, openapi, rest]
updated: 2026-07-25
---

# API design

> Planned surface for `apps/api`, introduced by
> [[ADR-0001-own-api-instead-of-supabase]]. Replaces the PostgREST endpoints v1 consumed
> directly.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | NestJS 11 on Fastify | Module structure and DI keep 11 feature areas navigable; interceptors are exactly the right shape for the RLS transaction wrapper |
| Queries | Drizzle | Typed SQL without hiding it; SQL migrations stay the source of truth |
| Validation | Zod via `nestjs-zod` | The same schemas validate requests and generate OpenAPI, and they live in `packages/contracts` shared with the app |
| Logging | Pino | Structured JSON, low overhead |
| Hardening | Helmet, CORS allowlist, rate limiting | |

## Request lifecycle

Every request passes through the same pipeline, in this order:

1. **JWT guard** — verifies the access token, extracts claims. Public routes are explicitly
   marked; the guard is global so the default is authenticated.
2. **RLS interceptor** — opens a transaction and sets `request.jwt.claims` transaction-locally.
   Detail and the pooling trap: [[ADR-0003-keep-rls-as-the-authorization-layer]].
3. **Zod validation** — request body and params against the shared contract.
4. **Handler** — thin; business rules live in services, sport rules in `packages/domain`.

Because the interceptor is global, a new endpoint is authorized by the database whether or not
its author remembered to think about permissions.

## Authentication

Two credential types, matching [[KV-EENDRACHT-APP-SPEC#5. Roles and permissions]]:

- **Staff** — email and password. Argon2id hashing. There is no public sign-up; accounts are
  created by an admin, as in v1.
- **Community** — anonymous sessions. The client picks a display name, the API creates the
  `auth.users` and `profiles` rows and issues a JWT with `is_anonymous: true`. The existing
  `handle_new_user` trigger and the whole moderation model keep working unchanged.

**Token strategy**

| Token | Lifetime | Web | Native |
|---|---|---|---|
| Access | 15 min | memory | memory |
| Refresh | 30 days, rotating | httpOnly `Secure` `SameSite=Lax` cookie | `expo-secure-store` |

Refresh tokens rotate on every use, and reuse of a consumed token revokes the whole family —
the standard detection for a stolen refresh token. Because the web refresh endpoint is
cookie-authenticated it is CSRF-exposed, so it additionally requires an `Origin` check against
the allowlist.

v1's chunked SecureStore adapter is dropped: it existed only because Supabase tokens exceeded
the 2 KB per-key limit, and ours do not.

## Endpoint groups

| Module | Surface |
|---|---|
| `auth` | login, refresh, logout, forgot/reset password, anonymous sign-in, me |
| `players` | admin CRUD, archive, duplicate detection; public list via `v_players_public` |
| `competitions` | competitions, rounds, standings, attendance, finalize/reopen |
| `tournaments` | tournaments, registrations, teams, draw publication |
| `matches` | schedule, results, `apply_match_result` |
| `content` | agenda, news |
| `community` | forum topics and replies, likes, polls, reports |
| `moderation` | queue, approve/reject, blocklist |
| `storage` | presigned upload URLs, upload completion |
| `realtime` | WebSocket endpoint |
| `settings` | `app_settings` read, admin write |

Public reads never expose personal data: player endpoints select from `v_players_public`,
which omits `phone`, `email` and `admin_notes`.

## Conventions

- **Versioned prefix** `/v1`, so a breaking change can ship alongside an old app version still
  on someone's phone. Mobile clients update on their own schedule; this is not optional.
- **Sport RPCs stay RPCs.** `apply_match_result`, `recalculate_standings`, `finalize_round` and
  `reopen_round` are exposed as intent-named endpoints (`POST /v1/matches/:id/result`) that
  call the existing `SECURITY DEFINER` functions. The transactional guarantees live in the
  database, where they were designed — the API does not reimplement them.
- **Idempotency** — result mutations carry `client_mutation_id`; the unique constraint makes
  retries safe, and a repeat returns the existing result rather than an error.
- **Errors** — RFC 9457 problem+json, with a Dutch `detail` suitable for direct display. The
  `translateDbError` and `translateAuthError` helpers from v1 move server-side, so Dutch
  messaging is produced once rather than in every client.
- **OpenAPI** at `/v1/openapi.json`; the typed client is generated into `packages/contracts`
  and imported by the app.

## Realtime

`GET /v1/stream` upgrades to WebSocket. Clients subscribe to topics (`matches`,
`match_results`, `standings`); the server relays `pg_notify` events carrying only a table name
and an id. No row data crosses the socket — clients invalidate and refetch through authorized
endpoints, so RLS is never bypassed. See [[ADR-0005-websocket-for-realtime]].

## Testing

- **Unit** — services with mocked repositories.
- **Integration** — Vitest with Testcontainers against a real Postgres, migrations applied.
- **RLS suite** — the six invariants in
  [[KV-EENDRACHT-APP-SPEC#9. Row Level Security matrix]] asserted as real sessions: an
  anonymous session must not read `player_profiles.phone`, must not see draft tournaments, and
  must not write a row owned by someone else. This closes the automation gap logged in
  [[KV-EENDRACHT-APP-SPEC#13. Testing]].

## Related

- [[ARCHITECTURE]] · [[DATABASE]] · [[INFRA]]
- [[ADR-0003-keep-rls-as-the-authorization-layer]] · [[ADR-0006-minio-for-object-storage]]
