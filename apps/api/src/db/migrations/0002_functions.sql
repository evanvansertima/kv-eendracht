-- KV Eendracht — functies, views en RPC's
-- Migratie 2

-- ---------------------------------------------------------------- rolhelpers
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'guest');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin','super_admin');
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('moderator','admin','super_admin');
$$;

create or replace function public.can_enter_results()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(
    (select match_entry_rights from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_blocked()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_blocked from public.profiles where id = auth.uid()), false)
      or exists (select 1 from public.blocked_users
                 where user_id = auth.uid()
                   and (expires_at is null or expires_at > now()));
$$;

create or replace function public.feature_enabled(feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> feature)::boolean
                   from public.app_settings where key = 'community_features'), false);
$$;

-- ---------------------------------------------------------------- rate limit
create or replace function public.check_rate_limit(p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  max_n int;
  window_min int;
  cnt int;
begin
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

create or replace function public.trg_rate_limit_topic() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('forum_topic'); return new; end $$;
create or replace function public.trg_rate_limit_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('forum_reply'); return new; end $$;
create or replace function public.trg_rate_limit_media() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('media_upload'); return new; end $$;
create or replace function public.trg_rate_limit_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('report'); return new; end $$;

create trigger rate_limit_topics before insert on public.forum_topics
  for each row execute function public.trg_rate_limit_topic();
create trigger rate_limit_replies before insert on public.forum_replies
  for each row execute function public.trg_rate_limit_reply();
create trigger rate_limit_media before insert on public.media_uploads
  for each row execute function public.trg_rate_limit_media();
create trigger rate_limit_reports before insert on public.reports
  for each row execute function public.trg_rate_limit_report();

-- anonieme gebruikers: nieuwe topics/foto's in moderatiewachtrij
create or replace function public.trg_moderation_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() and coalesce(
    (select is_anonymous from public.profiles where id = auth.uid()), true) then
    new.moderation_status := 'pending';
  end if;
  return new;
end $$;
create trigger moderation_default_topics before insert on public.forum_topics
  for each row execute function public.trg_moderation_default();
create trigger moderation_default_media before insert on public.media_uploads
  for each row execute function public.trg_moderation_default();

-- tellers bijhouden
create or replace function public.trg_reply_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_topics set reply_count = reply_count + 1 where id = new.topic_id;
    return new;
  end if;
  update public.forum_topics set reply_count = greatest(reply_count - 1, 0) where id = old.topic_id;
  return old;
end $$;
create trigger reply_count_trg after insert or delete on public.forum_replies
  for each row execute function public.trg_reply_count();

create or replace function public.trg_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare delta int := case when tg_op = 'INSERT' then 1 else -1 end;
        v_type text; v_id uuid;
begin
  if tg_op = 'INSERT' then
    v_type := new.subject_type; v_id := new.subject_id;
  else
    v_type := old.subject_type; v_id := old.subject_id;
  end if;
  if v_type = 'forum_topic' then
    update public.forum_topics set like_count = greatest(like_count + delta, 0) where id = v_id;
  elsif v_type = 'forum_reply' then
    update public.forum_replies set like_count = greatest(like_count + delta, 0) where id = v_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger like_count_trg after insert or delete on public.reactions
  for each row execute function public.trg_like_count();

-- ---------------------------------------------------------------- audit
create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id; v_old := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_record_id := new.id; v_new := to_jsonb(new);
  else
    v_record_id := new.id; v_old := to_jsonb(old); v_new := to_jsonb(new);
  end if;
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  values (auth.uid(), tg_op, tg_table_name, v_record_id, v_old, v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger audit_results after insert or update or delete on public.match_results
  for each row execute function public.write_audit();
create trigger audit_attendance after insert or update or delete on public.attendance
  for each row execute function public.write_audit();
create trigger audit_profiles_role after update on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.write_audit();
create trigger audit_rounds after update on public.competition_rounds
  for each row execute function public.write_audit();
create trigger audit_matches after update on public.matches
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------- views
-- spelers zonder contactgegevens (publiek)
create or replace view public.v_players_public
with (security_invoker = off) as
  select id, first_name, infix, last_name, display_name, age_category, gender,
         skill_level, club, is_active, photo_url, created_at
  from public.player_profiles
  where archived_at is null;

-- publieke profielen (alleen schermnaam)
create or replace view public.v_profiles_public
with (security_invoker = off) as
  select id, display_name, is_anonymous from public.profiles;

-- peiling-totalen zonder individuele stemmen te lekken
create or replace view public.v_poll_results
with (security_invoker = off) as
  select o.poll_id, o.id as option_id, o.label, o.sort_order,
         count(v.id)::int as votes
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  group by o.poll_id, o.id;

-- competitiestand gesorteerd volgens KV Eendracht-default
create or replace view public.v_competition_standings
with (security_invoker = off) as
  select s.*, p.display_name, p.photo_url,
         row_number() over (
           partition by s.competition_id
           order by s.eersten_voor desc, s.eersten_tegen asc, s.saldo desc,
                    s.deelnames desc, p.display_name asc
         )::int as computed_position
  from public.standings s
  join public.player_profiles p on p.id = s.player_id;

-- poulestand (KNKB: winst 7, verlies = eersten)
create or replace view public.v_poule_standings
with (security_invoker = off) as
  with poule_matches as (
    select m.tournament_id, m.poule_no, m.id,
           m.team_red_id, m.team_white_id,
           r.eersten_red, r.eersten_white, r.winner
    from public.matches m
    join public.match_results r on r.match_id = m.id
    where m.poule_no is not null and m.status = 'finished'
  ),
  per_team as (
    select tournament_id, poule_no, team_red_id as team_id,
           1 as gespeeld,
           case when winner = 'red' then 1 else 0 end as gewonnen,
           case when winner = 'white' then 1 else 0 end as verloren,
           case when winner = 'red' then 7 else eersten_red end as punten,
           eersten_red as eersten_voor, eersten_white as eersten_tegen
    from poule_matches
    union all
    select tournament_id, poule_no, team_white_id,
           1,
           case when winner = 'white' then 1 else 0 end,
           case when winner = 'red' then 1 else 0 end,
           case when winner = 'white' then 7 else eersten_white end,
           eersten_white, eersten_red
    from poule_matches
  )
  select t.tournament_id, t.poule_no, t.team_id, tm.team_no, tm.name as team_name,
         sum(t.gespeeld)::int as gespeeld,
         sum(t.gewonnen)::int as gewonnen,
         sum(t.verloren)::int as verloren,
         sum(t.punten)::int as punten,
         sum(t.eersten_voor)::int as eersten_voor,
         sum(t.eersten_tegen)::int as eersten_tegen,
         (sum(t.eersten_voor) - sum(t.eersten_tegen))::int as saldo
  from per_team t
  join public.teams tm on tm.id = t.team_id
  group by t.tournament_id, t.poule_no, t.team_id, tm.team_no, tm.name;

-- moderatorwachtrij
create or replace view public.v_moderation_queue
with (security_invoker = on) as
  select 'forum_topic' as subject_type, id as subject_id, title as preview, created_at
  from public.forum_topics where moderation_status = 'pending'
  union all
  select 'forum_reply', id, left(body, 80), created_at
  from public.forum_replies where moderation_status = 'pending'
  union all
  select 'media_upload', id, coalesce(caption, storage_path), created_at
  from public.media_uploads where moderation_status = 'pending';

-- ---------------------------------------------------------------- standen-RPC
create or replace function public.recalculate_standings(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders mogen standen herberekenen';
  end if;

  -- bewaar vorige posities
  update public.standings s
     set previous_position = position
   where s.competition_id = p_competition_id;

  -- zorg dat elke actieve deelnemer een rij heeft
  insert into public.standings (competition_id, player_id)
  select cp.competition_id, cp.player_id
    from public.competition_players cp
   where cp.competition_id = p_competition_id
  on conflict (competition_id, player_id) do nothing;

  -- herbereken alles uit uitslagen (via afgeronde partijen van deze competitie)
  with player_match as (
    select tm.player_id,
           case when tm2.side = 'red' then r.eersten_red else r.eersten_white end as voor,
           case when tm2.side = 'red' then r.eersten_white else r.eersten_red end as tegen,
           case when r.winner = tm2.side then 1 else 0 end as won,
           case when r.winner is not null and r.winner <> 'draw' and r.winner <> tm2.side then 1 else 0 end as lost
    from public.matches m
    join public.competition_rounds cr on cr.id = m.competition_round_id
    join public.match_results r on r.match_id = m.id
    join lateral (
      select m.team_red_id as team_id, 'red'::text as side
      union all
      select m.team_white_id, 'white'
    ) tm2 on true
    join public.team_members tm on tm.team_id = tm2.team_id
    where cr.competition_id = p_competition_id and m.status = 'finished'
  ),
  agg as (
    select player_id,
           coalesce(sum(voor),0)::int as ev, coalesce(sum(tegen),0)::int as et,
           count(*)::int as gespeeld,
           coalesce(sum(won),0)::int as gewonnen, coalesce(sum(lost),0)::int as verloren
    from player_match group by player_id
  ),
  att as (
    select a.player_id,
           count(*) filter (where a.status in ('present','guest'))::int as deelnames,
           count(*) filter (where a.status = 'absent')::int as afwezig
    from public.attendance a
    join public.competition_rounds cr on cr.id = a.round_id
    where cr.competition_id = p_competition_id
    group by a.player_id
  )
  update public.standings s
     set eersten_voor  = coalesce(g.ev, 0),
         eersten_tegen = coalesce(g.et, 0),
         saldo         = coalesce(g.ev, 0) - coalesce(g.et, 0),
         gespeeld      = coalesce(g.gespeeld, 0),
         gewonnen      = coalesce(g.gewonnen, 0),
         verloren      = coalesce(g.verloren, 0),
         deelnames     = coalesce(t.deelnames, 0),
         afwezig       = coalesce(t.afwezig, 0),
         updated_at    = now()
    from public.standings s2
    left join agg g on g.player_id = s2.player_id
    left join att t on t.player_id = s2.player_id
   where s.id = s2.id and s2.competition_id = p_competition_id;

  -- posities toekennen volgens sorteerregels
  with ranked as (
    select s.id,
           row_number() over (
             order by s.eersten_voor desc, s.eersten_tegen asc, s.saldo desc,
                      s.deelnames desc, p.display_name asc
           )::int as pos
    from public.standings s
    join public.player_profiles p on p.id = s.player_id
    where s.competition_id = p_competition_id
  )
  update public.standings s set position = r.pos
    from ranked r where r.id = s.id;
end $$;

-- ---------------------------------------------------------------- uitslag-RPC (idempotent)
create or replace function public.apply_match_result(
  p_match_id uuid,
  p_eersten_red int,
  p_eersten_white int,
  p_winner text,
  p_points_last_eerst text,
  p_note text,
  p_client_mutation_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_match public.matches%rowtype;
  v_result_id uuid;
  v_round_id uuid;
  v_win_team uuid;
  v_lose_team uuid;
begin
  if not public.can_enter_results() then
    raise exception 'Geen rechten om uitslagen in te voeren';
  end if;

  -- idempotentie: zelfde mutatie-ID → zelfde resultaat, geen dubbele verwerking
  select id into v_result_id from public.match_results
   where client_mutation_id = p_client_mutation_id;
  if found then return v_result_id; end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Wedstrijd niet gevonden'; end if;

  if p_eersten_red < 0 or p_eersten_white < 0 then
    raise exception 'Eersten kunnen niet negatief zijn';
  end if;
  if p_winner not in ('red','white','draw') then
    raise exception 'Ongeldige winnaar';
  end if;
  if p_winner = 'red' and p_eersten_red < p_eersten_white then
    raise exception 'Onmogelijke uitslag: winnaar heeft minder eersten';
  end if;
  if p_winner = 'white' and p_eersten_white < p_eersten_red then
    raise exception 'Onmogelijke uitslag: winnaar heeft minder eersten';
  end if;

  insert into public.match_results
    (match_id, eersten_red, eersten_white, winner, points_last_eerst, note, entered_by, client_mutation_id)
  values
    (p_match_id, p_eersten_red, p_eersten_white, p_winner, p_points_last_eerst, p_note, auth.uid(), p_client_mutation_id)
  on conflict (match_id) do update
    set eersten_red = excluded.eersten_red,
        eersten_white = excluded.eersten_white,
        winner = excluded.winner,
        points_last_eerst = excluded.points_last_eerst,
        note = excluded.note,
        entered_by = excluded.entered_by,
        client_mutation_id = excluded.client_mutation_id
  returning id into v_result_id;

  update public.matches
     set status = 'finished', finished_at = coalesce(finished_at, now())
   where id = p_match_id;

  -- winnaar doorzetten in bracket
  if p_winner in ('red','white') then
    v_win_team  := case when p_winner = 'red' then v_match.team_red_id else v_match.team_white_id end;
    v_lose_team := case when p_winner = 'red' then v_match.team_white_id else v_match.team_red_id end;

    if v_match.next_match_id is not null then
      if v_match.next_slot = 'red' then
        update public.matches set team_red_id = v_win_team where id = v_match.next_match_id;
      else
        update public.matches set team_white_id = v_win_team where id = v_match.next_match_id;
      end if;
    end if;

    -- verliezer naar herkansing (alleen vanuit omloop 1 hoofdbracket)
    if v_match.consolation_next_match_id is not null then
      if v_match.consolation_next_slot = 'red' then
        update public.matches set team_red_id = v_lose_team where id = v_match.consolation_next_match_id;
      else
        update public.matches set team_white_id = v_lose_team where id = v_match.consolation_next_match_id;
      end if;
    end if;
  end if;

  -- automatische aanwezigheid bij competitiepartijen (max 1 per speler per avond)
  v_round_id := v_match.competition_round_id;
  if v_round_id is not null then
    insert into public.attendance (round_id, player_id, status, source)
    select v_round_id, tm.player_id, 'present', 'auto'
      from public.team_members tm
     where tm.team_id in (v_match.team_red_id, v_match.team_white_id)
    on conflict (round_id, player_id) do nothing;
  end if;

  return v_result_id;
end $$;

-- ---------------------------------------------------------------- speelavond afronden / heropenen
create or replace function public.finalize_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_comp uuid;
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders mogen een speelavond afronden';
  end if;

  select competition_id into v_comp from public.competition_rounds where id = p_round_id;
  if not found then raise exception 'Speelavond niet gevonden'; end if;

  -- alle verwachte (actieve) deelnemers zonder registratie → afwezig
  insert into public.attendance (round_id, player_id, status, source)
  select p_round_id, cp.player_id, 'absent', 'auto'
    from public.competition_players cp
   where cp.competition_id = v_comp and cp.is_active
  on conflict (round_id, player_id) do nothing;

  update public.competition_rounds
     set status = 'finalized', finalized_at = now(), finalized_by = auth.uid()
   where id = p_round_id;

  perform public.recalculate_standings(v_comp);
end $$;

create or replace function public.reopen_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_comp uuid;
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders mogen een speelavond heropenen';
  end if;
  select competition_id into v_comp from public.competition_rounds where id = p_round_id;

  -- automatisch gezette afwezigheid verwijderen; handmatige correcties blijven
  delete from public.attendance
   where round_id = p_round_id and status = 'absent' and source = 'auto';

  update public.competition_rounds
     set status = 'open', finalized_at = null, finalized_by = null
   where id = p_round_id;

  perform public.recalculate_standings(v_comp);
end $$;

-- controlescherm vóór afronden
create or replace function public.round_finalize_preview(p_round_id uuid)
returns table (player_id uuid, display_name text, current_status text) language sql
security definer set search_path = public as $$
  select cp.player_id, p.display_name,
         coalesce(a.status, 'niet_verwerkt') as current_status
    from public.competition_rounds cr
    join public.competition_players cp on cp.competition_id = cr.competition_id and cp.is_active
    join public.player_profiles p on p.id = cp.player_id
    left join public.attendance a on a.round_id = cr.id and a.player_id = cp.player_id
   where cr.id = p_round_id
   order by current_status, p.display_name;
$$;

-- ---------------------------------------------------------------- realtime
-- Replaces `alter publication supabase_realtime add table ...`.
-- The API holds one dedicated LISTEN connection and relays to WebSocket clients.
-- Only a table name and id travel: clients invalidate the matching query key and
-- refetch through the normal authorized endpoint, so RLS is never bypassed.
-- See docs/Decisions/ADR-0005-websocket-for-realtime.md.
create or replace function public.notify_change() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  perform pg_notify('kv_changes', json_build_object(
    'table', tg_table_name,
    'op',    lower(tg_op),
    'id',    coalesce(new.id, old.id)
  )::text);
  return null;
end $$;

create trigger trg_notify_matches after insert or update or delete on public.matches
  for each row execute function public.notify_change();
create trigger trg_notify_match_results after insert or update or delete on public.match_results
  for each row execute function public.notify_change();
create trigger trg_notify_standings after insert or update or delete on public.standings
  for each row execute function public.notify_change();
