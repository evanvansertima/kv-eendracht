-- 0004_seed_guard.sql
--
-- Closes the migration drift recorded in
-- KV-EENDRACHT-APP-SPEC §15 "Known limitations, drift and roadmap":
--
--   > The live database was patched via the SQL Editor so that check_rate_limit() and
--   > trg_moderation_default() return early when auth.uid() IS NULL (seed scripts have
--   > no session). The local migration files still contain the original versions.
--   > Action: add a 4th migration containing both CREATE OR REPLACE statements so a
--   > fresh db push matches production.
--
-- This is that migration. In v1 the fix lived only in the hosted database, applied by
-- hand through the dashboard, so a fresh `db push` silently produced a different schema
-- from production. Here it is version-controlled and applied by the same path as every
-- other change — the drift cannot recur, because there is no dashboard to patch from.
--
-- The failure it fixes: seeding forum content raises
--   null value in column "user_id" of relation "rate_limit_events"
-- because check_rate_limit() inserts auth.uid(), which is NULL when SQL runs outside a
-- request.

-- ─────────────────────────────────────────── rate limiting

-- Rate limits are a per-user control. With no user there is nothing to limit, and
-- attributing the event to NULL violates the not-null constraint.
--
-- This is not a security hole: every INSERT policy on the community tables independently
-- requires auth.uid() to be non-null, so an unauthenticated caller cannot reach these
-- triggers through the API at all. The only callers with no session are trusted local
-- scripts — seeds and migrations — which are running as kv_migrator anyway.
create or replace function public.check_rate_limit(p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  max_n int;
  window_min int;
  cnt int;
begin
  -- No session: seed or migration context. Nothing to rate limit.
  if auth.uid() is null then return; end if;
  if public.is_moderator() then return; end if;

  select value -> p_action into cfg from public.app_settings where key = 'rate_limits';
  if cfg is null then return; end if;
  max_n := (cfg ->> 'max')::int;
  window_min := (cfg ->> 'window_minutes')::int;

  select count(*) into cnt from public.rate_limit_events
   where user_id = auth.uid() and action = p_action
     and created_at > now() - make_interval(mins => window_min);

  if cnt >= max_n then
    raise exception 'Je hebt te veel berichten in korte tijd geplaatst. Probeer het later opnieuw.'
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (user_id, action) values (auth.uid(), p_action);
end $$;

-- ─────────────────────────────────────────── moderation default

-- Original behaviour: anything authored by an anonymous profile starts as 'pending'.
-- The coalesce defaulted to TRUE when no profile was found, so seeded rows with no
-- session were forced to 'pending' too — which would hide all the demo content behind
-- an empty moderation queue.
--
-- Content inserted with no session comes from a seed or a migration, and is trusted:
-- it keeps whatever status it was given. Real anonymous authors still start pending,
-- because they always have a session and therefore a non-null auth.uid().
create or replace function public.trg_moderation_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_moderator() and coalesce(
    (select is_anonymous from public.profiles where id = auth.uid()), true) then
    new.moderation_status := 'pending';
  end if;

  return new;
end $$;
