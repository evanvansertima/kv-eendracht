-- Self-registration for wedstrijden.
--
-- Three things are missing before a participant can sign themselves up.
--
-- 1. THE LINK. player_profiles (the sport record: niveau, geslacht, vereniging) and
--    profiles (the login) were entirely unconnected. Without a link, "register me" has
--    no way to know which partuur-eligible player "me" is, so registration could only
--    ever be something an admin did on someone's behalf.
--
-- 2. THE WINDOW. The club's flow is: create the wedstrijd (stap 1-2), let people
--    register, then draw after the deadline (stap 3-5). That needs a registration
--    period.
--
--    Modelled as two timestamps rather than as extra `status` values. Status is about
--    lifecycle and visibility (draft / published / live / finished / cancelled) and is
--    read by RLS policies elsewhere; widening it to carry a registration phase would
--    mix two concerns and force every one of those policies to be re-read. A window is
--    also simply truer: "registration closes Friday 20:00" is a time, not a state
--    someone has to remember to toggle.
--
-- 3. THE POLICY. regs_admin_write allowed only is_admin(). A participant needs to be
--    able to insert and withdraw their OWN registration, and nobody else's.

-- ---------------------------------------------------------------- 1. the link
alter table public.player_profiles
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null;

comment on column public.player_profiles.profile_id is
  'The login this player record belongs to, when the player has an account. Nullable: '
  'most players in the database have never signed in, and archived players keep their '
  'history after their account is gone.';

create index if not exists idx_player_profiles_profile on public.player_profiles(profile_id);

-- ---------------------------------------------------------------- 2. the window
alter table public.tournaments
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_deadline timestamptz;

-- A deadline before the opening would silently close registration forever.
alter table public.tournaments
  drop constraint if exists tournaments_registration_window_ck;
alter table public.tournaments
  add constraint tournaments_registration_window_ck
  check (
    registration_opens_at is null
    or registration_deadline is null
    or registration_deadline > registration_opens_at
  );

/**
 * True when a wedstrijd is currently accepting registrations.
 *
 * An absent opening means "open from the start"; an absent deadline means "no closing
 * time". Both null therefore means permanently open, which is the sensible reading for
 * a wedstrijd whose organiser has not set a window.
 */
create or replace function public.registration_is_open(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournaments t
     where t.id = p_tournament_id
       and t.status = 'published'
       and t.draw_published_at is null      -- once drawn, registration is over
       and (t.registration_opens_at is null or t.registration_opens_at <= now())
       and (t.registration_deadline is null or t.registration_deadline > now())
  );
$$;

/** The player record belonging to the signed-in user, if any. */
create or replace function public.my_player_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.player_profiles where profile_id = auth.uid() and archived_at is null;
$$;

-- ---------------------------------------------------------------- 3. the policies
alter table public.tournament_registrations enable row level security;

drop policy if exists regs_self_insert on public.tournament_registrations;
create policy regs_self_insert on public.tournament_registrations
  for insert with check (
    player_id = public.my_player_id()
    and public.registration_is_open(tournament_id)
    and not public.is_blocked()
  );

-- Withdrawing is an update to 'withdrawn', not a delete: the fact that someone signed
-- up and pulled out is worth keeping, and a delete would let a player silently free a
-- place after the list was published.
drop policy if exists regs_self_update on public.tournament_registrations;
create policy regs_self_update on public.tournament_registrations
  for update using (player_id = public.my_player_id())
  with check (player_id = public.my_player_id());

grant select, insert, update on public.tournament_registrations to kv_api;
