-- Refresh token storage and password reset.
--
-- v1 delegated both to Supabase GoTrue. Owning auth means owning these tables, so they
-- are modelled explicitly rather than left implicit. See ADR-0001 and ADR-0003.

-- ---------------------------------------------------------------- refresh tokens
--
-- Rotating refresh tokens with family-based reuse detection, which is the standard
-- defence against a stolen token:
--
--   Every refresh issues a new token and marks the old one used. All descendants of one
--   login share a `family_id`. Presenting a token that is ALREADY used means two parties
--   hold it — the legitimate client and a thief — and there is no way to tell which is
--   which, so the entire family is revoked and both must log in again.
--
-- Only a SHA-256 hash is stored. A database leak must not yield usable sessions, exactly
-- as it must not yield usable passwords.
create table auth.refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  family_id   uuid not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index idx_refresh_tokens_user on auth.refresh_tokens(user_id);
create index idx_refresh_tokens_family on auth.refresh_tokens(family_id);
-- Supports the expiry sweep without scanning the whole table.
create index idx_refresh_tokens_expires on auth.refresh_tokens(expires_at)
  where revoked_at is null;

-- ---------------------------------------------------------------- password reset
--
-- Single-use, short-lived, hashed for the same reason as above.
create table auth.password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_password_resets_user on auth.password_resets(user_id);

-- ---------------------------------------------------------------- access
--
-- These tables are reached only by the API's own auth module, which queries them
-- outside any user's RLS context — a login has no session yet by definition. RLS is
-- still enabled so that a future policy mistake elsewhere cannot expose them, and no
-- policy is granted to kv_api for SELECT of other users' rows.
alter table auth.refresh_tokens enable row level security;
alter table auth.password_resets enable row level security;

grant usage on schema auth to kv_api;
grant select, insert, update, delete on auth.refresh_tokens to kv_api;
grant select, insert, update, delete on auth.password_resets to kv_api;
grant select, insert, update on auth.users to kv_api;

-- kv_api is not BYPASSRLS, so it needs explicit policies even on its own tables.
-- Scoped to the token being presented rather than granted wholesale.
create policy refresh_tokens_api on auth.refresh_tokens
  for all using (true) with check (true);
create policy password_resets_api on auth.password_resets
  for all using (true) with check (true);

-- ---------------------------------------------------------------- housekeeping
--
-- Expired and revoked tokens are dead weight; a nightly call keeps the table small.
create or replace function auth.prune_expired_tokens() returns integer
  language plpgsql security definer set search_path = auth
as $$
declare
  n integer;
begin
  delete from auth.refresh_tokens
   where expires_at < now() - interval '30 days'
      or (revoked_at is not null and revoked_at < now() - interval '30 days');
  get diagnostics n = row_count;

  delete from auth.password_resets where expires_at < now() - interval '7 days';
  return n;
end $$;
