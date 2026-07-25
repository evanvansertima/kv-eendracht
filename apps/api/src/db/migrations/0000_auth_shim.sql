-- 0000_auth_shim.sql
--
-- Replaces the parts of Supabase's `auth` schema that the ported migrations depend on,
-- so that ~1.400 lines of existing schema, policies and RPCs run unchanged on stock
-- Postgres. See docs/Decisions/ADR-0001-own-api-instead-of-supabase.md and
-- docs/Decisions/ADR-0003-keep-rls-as-the-authorization-layer.md.
--
-- Run as kv_migrator. The schema itself is created by infra/postgres/init/01-roles.sh.

-- ─────────────────────────────────────────────────────────────── users

-- Mirrors the columns the ported code actually touches: profiles.id has an FK to this
-- table, handle_new_user() reads raw_user_meta_data and is_anonymous, and a trigger
-- fires on insert. Everything else in Supabase's auth.users is unused here.
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,                 -- argon2id; null for anonymous sessions
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  is_anonymous        boolean not null default false,
  email_confirmed_at  timestamptz,
  last_sign_in_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- An anonymous user has no credentials; a staff user must have both.
  constraint auth_users_credentials_ck check (
    (is_anonymous and email is null and encrypted_password is null)
    or (not is_anonymous and email is not null and encrypted_password is not null)
  )
);

create index if not exists idx_auth_users_email on auth.users (email) where email is not null;

-- ─────────────────────────────────────────────────────── claim accessors

-- The current request's JWT claims, or NULL outside a request.
--
-- The nullif() guards the SETTING rather than the extracted claim, and that ordering is
-- load-bearing. Once a transaction-local setting is reset, current_setting(..., true)
-- returns an empty string, not NULL — and ''::jsonb raises
-- "invalid input syntax for type json". Guarding only the extracted value lets that
-- cast run first and throws on every request made outside a transaction.
-- Verified against Postgres 17 before this file was written.
create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

-- Identical semantics to Supabase's auth.uid(). All 43 call sites in the ported
-- policies and RPCs rely on this returning NULL for an unauthenticated request.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.email() returns text
  language sql stable
as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;

create or replace function auth.role() returns text
  language sql stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'role', ''), 'anon')
$$;

comment on function auth.uid() is
  'Current user id from request.jwt.claims, or NULL when unauthenticated. Set per request by the API''s RLS interceptor via set_config(..., true).';

-- ─────────────────────────────────────────────────────────────── grants

grant usage on schema auth to kv_api;
grant select, insert, update, delete on auth.users to kv_api;
grant execute on function auth.jwt(), auth.uid(), auth.email(), auth.role() to kv_api;

-- auth.users is written only through the API's auth module, never by end users.
alter table auth.users enable row level security;
