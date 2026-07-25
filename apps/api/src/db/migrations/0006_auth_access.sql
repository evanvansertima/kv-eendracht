-- Controlled access to auth.users.
--
-- 0000_auth_shim.sql enables RLS on auth.users and defines no policy, so the table is
-- deny-by-default for kv_api — which is exactly right for a table of password hashes,
-- and was caught by a login failing against a correct password.
--
-- The fix is NOT a permissive policy. A `using (true)` policy would let any request that
-- reaches a route touching auth.users read every hash in the club. Instead the auth
-- module gets a small set of SECURITY DEFINER functions, each returning only the columns
-- that one operation needs. This is the same pattern the public schema already uses for
-- is_admin() and friends, and it keeps the blast radius of a future routing mistake to
-- the fields these functions expose.
--
-- Every function sets search_path explicitly: a SECURITY DEFINER function without one is
-- a privilege escalation path.

-- ---------------------------------------------------------------- login
--
-- Returns the minimum a password check needs. Note it does NOT filter out anonymous
-- accounts: the caller must reject those, so that "this is an anonymous account" and
-- "no such account" stay indistinguishable in both timing and response.
create or replace function auth.find_login(p_email text)
returns table (id uuid, password_hash text, is_anonymous boolean)
language sql stable security definer set search_path = auth, pg_temp as $$
  select u.id, u.encrypted_password, u.is_anonymous
    from auth.users u
   where lower(u.email) = lower(p_email)
$$;

create or replace function auth.record_sign_in(p_user_id uuid)
returns void language sql volatile security definer set search_path = auth, pg_temp as $$
  update auth.users set last_sign_in_at = now(), updated_at = now() where id = p_user_id
$$;

-- ---------------------------------------------------------------- session
--
-- Role and email for the JWT claims. Reads profiles too so the API needs one round trip
-- rather than two, and so a caller can never receive an email without its role.
create or replace function auth.session_claims(p_user_id uuid)
returns table (role text, email text, is_anonymous boolean, display_name text)
language sql stable security definer set search_path = auth, public, pg_temp as $$
  select p.role, u.email, p.is_anonymous, p.display_name
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_user_id
$$;

-- ---------------------------------------------------------------- anonymous sign-in
--
-- The community path from spec section 5. Creates the auth row; the handle_new_user
-- trigger creates the matching profile, then the chosen display name is applied.
create or replace function auth.create_anonymous(p_display_name text)
returns uuid language plpgsql volatile security definer
set search_path = auth, public, pg_temp as $$
declare
  v_id uuid;
begin
  if char_length(trim(p_display_name)) < 2 or char_length(trim(p_display_name)) > 32 then
    raise exception 'Kies een schermnaam van 2 tot 32 tekens.';
  end if;

  insert into auth.users (is_anonymous, raw_user_meta_data)
  values (true, jsonb_build_object('display_name', trim(p_display_name)))
  returning id into v_id;

  update public.profiles set display_name = trim(p_display_name) where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- password reset
--
-- Only ever resolves non-anonymous accounts: an anonymous session has no password to
-- reset, and no email to send anything to.
create or replace function auth.find_resettable(p_email text)
returns uuid language sql stable security definer set search_path = auth, pg_temp as $$
  select u.id from auth.users u
   where lower(u.email) = lower(p_email) and u.is_anonymous = false
$$;

create or replace function auth.set_password(p_user_id uuid, p_hash text)
returns void language sql volatile security definer set search_path = auth, pg_temp as $$
  update auth.users
     set encrypted_password = p_hash, updated_at = now()
   where id = p_user_id and is_anonymous = false
$$;

-- ---------------------------------------------------------------- grants
--
-- EXECUTE to kv_api only. Revoke from PUBLIC first: functions are executable by PUBLIC
-- by default, which would undo the point of the exercise.
revoke all on function auth.find_login(text)          from public;
revoke all on function auth.record_sign_in(uuid)      from public;
revoke all on function auth.session_claims(uuid)      from public;
revoke all on function auth.create_anonymous(text)    from public;
revoke all on function auth.find_resettable(text)     from public;
revoke all on function auth.set_password(uuid, text)  from public;

grant execute on function auth.find_login(text)         to kv_api;
grant execute on function auth.record_sign_in(uuid)     to kv_api;
grant execute on function auth.session_claims(uuid)     to kv_api;
grant execute on function auth.create_anonymous(text)   to kv_api;
grant execute on function auth.find_resettable(text)    to kv_api;
grant execute on function auth.set_password(uuid, text) to kv_api;

-- Direct table access is no longer needed and is withdrawn. auth.users is now reachable
-- only through the functions above.
revoke select, insert, update on auth.users from kv_api;

-- ---------------------------------------------------------------- token tables
--
-- refresh_tokens and password_resets keep their permissive policies deliberately. They
-- hold only SHA-256 hashes of opaque random tokens — no credentials, nothing that can be
-- reversed into a session — and the auth module must look rows up by hash before any
-- session exists, plus revoke a whole family across users' rows during reuse detection.
-- A per-row policy cannot express either operation.
comment on table auth.refresh_tokens is
  'Hashed rotating refresh tokens. Permissive RLS is intentional: hashes only, and the '
  'auth module must query pre-session and revoke whole families. See 0006_auth_access.sql.';
