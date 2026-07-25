---
title: ADR-0005 — WebSocket over pg_notify for live updates
project: kv-eendracht
status: accepted
date: 2026-07-25
tags: [adr, realtime, websocket, postgres, notify]
updated: 2026-07-25
---

# ADR-0005 — WebSocket over `pg_notify` for live updates

## Status

Accepted, 2026-07-25. Replaces Supabase Realtime, removed by
[[ADR-0001-own-api-instead-of-supabase]].

## Context

Three tables drive live updates, declared in v1 with three lines of SQL:

```sql
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_results;
alter publication supabase_realtime add table public.standings;
```

Six screens subscribe: tournament detail watches `matches` and `match_results`; the
competition screen watches `standings`. The user-visible behaviour is narrow and worth stating
precisely — when a volunteer enters a result at the side of the pitch, spectators' standings
update without a pull-to-refresh.

The payload requirement is smaller than it looks. Clients do not need the changed row; they
need to know *that* something changed so TanStack Query can invalidate the relevant key and
refetch through the normal authorized path. Sending row data over the socket would also
bypass RLS, since a broadcast has no request context to evaluate policies against.

## Decision

**Postgres `pg_notify` fanned out over WebSocket.**

A trigger on each of the three tables emits a small notification:

```sql
create function public.notify_change() returns trigger language plpgsql as $$
begin
  perform pg_notify('kv_changes', json_build_object(
    'table', tg_table_name,
    'id',    coalesce(new.id, old.id)
  )::text);
  return null;
end $$;
```

The API holds one dedicated `LISTEN kv_changes` connection — separate from the request pool,
because a listening connection is long-lived and must not be recycled — and relays each
notification to subscribed WebSocket clients. Clients map the topic to a query key and
invalidate it.

## Why WebSocket rather than SSE

Server-Sent Events would be the simpler protocol for one-way fanout, and on the web it is
built in. But [[ADR-0002-react-native-on-all-platforms]] commits to one codebase across web,
iOS and Android, and **React Native has no `EventSource`**. SSE would need a third-party
polyfill on native, i.e. platform-specific code in the exact layer that decision exists to
avoid.

`WebSocket` is built into both browsers and React Native. It is the only transport that works
natively on all three targets with no polyfill, so it wins on codebase-uniformity grounds even
though the protocol is heavier than the problem strictly requires.

## Consequences

**Good**

- No row data crosses the socket, so RLS is never bypassed — refetches go through normal
  authorized endpoints.
- Identical client code on all three platforms.
- No extra infrastructure: Postgres and the API already exist.

**Bad**

- `pg_notify` payloads are capped at 8000 bytes. Irrelevant here, since we send a table name
  and an id, but it rules out ever sending rows this way.
- Notifications are fire-and-forget: a client disconnected at the moment of a change misses
  it. Mitigated by refetching on reconnect and on app foreground, which TanStack Query already
  does.
- WebSocket needs correct reverse-proxy configuration (upgrade headers) and a heartbeat to
  survive idle timeouts — both handled in the Caddy config, see [[INFRA]].

## Related

- [[ADR-0001-own-api-instead-of-supabase]] · [[API]]
- [[KV-EENDRACHT-APP-SPEC#3. Architecture]] — the caching and realtime contract being preserved
