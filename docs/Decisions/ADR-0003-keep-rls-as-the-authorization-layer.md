---
title: ADR-0003 — Keep Postgres RLS as the only authorization layer
project: kv-eendracht
status: accepted
date: 2026-07-25
tags: [adr, security, rls, postgres, auth]
updated: 2026-07-25
---

# ADR-0003 — Keep Postgres RLS as the only authorization layer

## Status

Accepted, 2026-07-25. Upholds rule 4 of [[CLAUDE]] and
[[KV-EENDRACHT-APP-SPEC#9. Row Level Security matrix]] under the new backend.

## Context

[[ADR-0001-own-api-instead-of-supabase]] removes Supabase, and with it the reason RLS was
mandatory. In v1 the app shipped the anonymous key and talked to PostgREST directly, so
Postgres policies were the *only* thing standing between a user and the data. With our own
API in front, the conventional move would be to enforce permissions in application code —
guards, service-layer checks — and let the API connect as a privileged role.

That would be a mistake here. The RLS matrix is the most carefully designed part of the
system: policies on all 30 tables, encoding invariants like "contact details are never
reachable without `is_admin()`", "draft sport content is never public", and "only
`super_admin` may grant admin roles". Rewriting those as imperative checks means
reimplementing 30 tables' worth of reviewed security logic in a less verifiable form, and
every future endpoint becomes a fresh chance to forget one.

## Decision

**Keep RLS, and make the API subject to it.**

Three mechanisms:

**1. An `auth` schema shim.** Provide `auth.users`, `auth.uid()` and `auth.email()` in our
own database. `auth.uid()` reads the request's JWT claims exactly as Supabase's did:

```sql
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
           ''
         )::uuid
$$;
```

All 43 existing call sites keep working unchanged.

> **The nested `nullif` ordering is load-bearing, and the obvious version is wrong.**
> Guarding only the extracted claim —
> `nullif(current_setting(...)::jsonb ->> 'sub', '')` — lets the cast run first. Once a
> transaction-local setting has been reset, `current_setting(..., true)` returns an **empty
> string, not NULL**, and `''::jsonb` raises `invalid input syntax for type json`. That
> makes every unauthenticated request fail with a parse error instead of resolving to NULL.
> Caught by running it against Postgres 17 before porting the schema; the correct form is
> in `apps/api/src/db/migrations/0000_auth_shim.sql`.

**2. A transaction-scoped claims interceptor.** Every request runs inside one transaction that
first sets the claims:

```ts
await db.transaction(async (tx) => {
  await tx.execute(
    sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
  );
  // handler runs here — every policy sees the correct auth.uid()
});
```

The third argument `true` makes the setting **local to the transaction**. This is the detail
that makes connection pooling safe: without it, a pooled connection would leak one user's
identity into the next user's request. A global NestJS interceptor applies this, so an
individual handler cannot forget it.

**3. An unprivileged database role.** The API connects as `kv_api`, which is neither
`SUPERUSER` nor `BYPASSRLS`. A separate `kv_migrator` role owns the tables and runs
migrations. Without this, RLS is silently skipped and every policy becomes decoration — it is
the single most important line in the whole setup.

## Consequences

**Good**

- The entire reviewed security model survives the backend swap intact.
- Defence in depth: a bug in an API handler cannot leak data the policies forbid.
- Policies are now **automatically testable**, closing the gap logged in
  [[KV-EENDRACHT-APP-SPEC#13. Testing]]. Phase 1 adds a Testcontainers suite asserting the six
  invariants in [[KV-EENDRACHT-APP-SPEC#9. Row Level Security matrix]].

**Bad**

- Every request costs a transaction, even pure reads. Negligible at club scale, and the
  correctness is worth far more than the microseconds.
- Policy errors surface as generic "row not found" rather than clear authorization failures,
  which can be confusing to debug. Mitigated by the RLS test suite and by logging the active
  claims alongside failed mutations.
- `SECURITY DEFINER` RPCs must keep an explicit `search_path`, or they become a privilege
  escalation path. The existing functions already do this; it is now a review checklist item.

## Non-negotiable invariants

Carried over verbatim from [[KV-EENDRACHT-APP-SPEC#9. Row Level Security matrix]]:

- `phone`, `email` and `admin_notes` on `player_profiles` are unreachable without `is_admin()`.
- Draft or unpublished sport content is never readable by the public.
- An anonymous user can never write a row whose owner column is not `auth.uid()`.
- Only admins may modify results and standings.
- Only `super_admin` may grant `admin` or `super_admin`.
- No privileged database credential ever reaches the client bundle.

## Related

- [[ADR-0001-own-api-instead-of-supabase]] · [[API]] · [[DATABASE]]
