-- Public inschrijving for a wedstrijd.
--
-- Registering is deliberately open to anyone: a partuur from another vereniging has no
-- account here, and requiring one would mean the club loses entries. But the insert
-- policy on tournament_registrations requires is_admin() or a self-linked player, and
-- creating a player_profiles row requires admin — so an anonymous submission is refused
-- outright, which is what RLS should do by default.
--
-- The fix is not to widen those policies. Widening them to allow anonymous inserts would
-- also allow anonymous writes to every other wedstrijd's registrations, and to the player
-- database. Instead this one narrow function is trusted, in the same way
-- apply_match_result and apply_betaalstatus are: it validates everything itself, does
-- exactly one job, and is the only anonymous write path that exists.
--
-- What it enforces, so that nothing depends on the caller having checked:
--   * the wedstrijd exists and its inschrijving is genuinely open
--   * the partuur has exactly the number of spelers the formatiecategorie requires
--   * a replayed idempotency_key returns the original partuur instead of a second one

create or replace function public.inschrijven_wedstrijd(
  p_tournament_id uuid,
  p_idempotency_key uuid,
  p_spelers jsonb,          -- [{player_id | naam}, ...]
  p_aanmelder_naam text,
  p_aanmelder_email text,
  p_aanmelder_telefoon text
) returns table (partuur_group uuid, was_duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_existing uuid;
  v_formation text;
  v_verwacht int;
  v_speler jsonb;
  v_player_id uuid;
  v_naam text;
  v_first text;
  v_last text;
  v_first_row boolean := true;
begin
  -- Replay: a refresh or a return from the payment page.
  select r.partuur_group into v_existing
    from public.tournament_registrations r
   where r.idempotency_key = p_idempotency_key
   limit 1;

  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  select t.formation_category into v_formation
    from public.tournaments t where t.id = p_tournament_id;

  if v_formation is null then
    raise exception 'Wedstrijd niet gevonden';
  end if;

  if not public.registration_is_open(p_tournament_id) then
    raise exception 'De inschrijving voor deze wedstrijd is gesloten';
  end if;

  v_verwacht := case v_formation
                  when 'del' then 1
                  when 'del_abc' then 1
                  when 'twee_tegen_twee' then 2
                  when 'pearke' then 2
                  else 3
                end;

  if jsonb_array_length(p_spelers) <> v_verwacht then
    raise exception 'Deze wedstrijd verwacht % speler(s) per inschrijving', v_verwacht;
  end if;

  if coalesce(trim(p_aanmelder_naam), '') = ''
     or coalesce(trim(p_aanmelder_email), '') = ''
     or coalesce(trim(p_aanmelder_telefoon), '') = '' then
    raise exception 'Vul de gegevens van de aanmelder volledig in';
  end if;

  v_group := gen_random_uuid();

  for v_speler in select * from jsonb_array_elements(p_spelers) loop
    v_player_id := nullif(v_speler ->> 'player_id', '')::uuid;

    if v_player_id is null then
      v_naam := trim(coalesce(v_speler ->> 'naam', ''));
      if length(v_naam) < 2 then
        raise exception 'Kies een speler of vul een naam in';
      end if;

      -- A guest without a player record still has to be able to enter, so one is
      -- created. is_active stays false: they are not a club member until a beheerder
      -- says so, and this must not quietly grow the ledenlijst.
      v_first := split_part(v_naam, ' ', 1);
      v_last  := nullif(trim(substr(v_naam, length(v_first) + 1)), '');

      insert into public.player_profiles (first_name, last_name, is_active)
      values (v_first, coalesce(v_last, v_first), false)
      returning id into v_player_id;
    end if;

    insert into public.tournament_registrations
      (tournament_id, player_id, status, partuur_group, idempotency_key,
       aanmelder_naam, aanmelder_email, aanmelder_telefoon, betaalstatus)
    values
      (p_tournament_id, v_player_id, 'registered', v_group,
       case when v_first_row then p_idempotency_key else null end,
       trim(p_aanmelder_naam), lower(trim(p_aanmelder_email)), trim(p_aanmelder_telefoon),
       'unpaid');

    v_first_row := false;
  end loop;

  return query select v_group, false;
end $$;

comment on function public.inschrijven_wedstrijd is
  'Public inschrijving for a wedstrijd. SECURITY DEFINER because registering is open to '
  'anyone, including a partuur with no account, while the underlying policies correctly '
  'refuse anonymous writes. Validates the wedstrijd, the open inschrijving, the partuur '
  'size and the aanmelder details itself.';

revoke all on function public.inschrijven_wedstrijd from public;
grant execute on function public.inschrijven_wedstrijd to kv_api;

-- Reading back one's own confirmation must also work without an account: the aanmelder
-- follows the link from their confirmation and has no session.
create or replace function public.inschrijving_bevestiging(p_group uuid)
returns table (
  partuur_group uuid, wedstrijd text, played_on date, location text,
  spelers text[], aanmelder_naam text, aanmelder_email text, aanmelder_telefoon text,
  inleggeld_cents integer, betaald_cents integer, betaalstatus public.betaalstatus,
  betaald_op timestamptz, bevestigd_op timestamptz, ingeschreven_op timestamptz
)
language sql security definer set search_path = public as $$
  select r.partuur_group, t.name, t.played_on, t.location,
         array_agg(p.display_name order by p.display_name),
         min(r.aanmelder_naam), min(r.aanmelder_email), min(r.aanmelder_telefoon),
         min(t.inleggeld_cents), min(r.betaald_cents), min(r.betaalstatus),
         min(r.betaald_op), min(r.bevestigd_op), min(r.created_at)
    from public.tournament_registrations r
    join public.tournaments t on t.id = r.tournament_id
    join public.player_profiles p on p.id = r.player_id
   where r.partuur_group = p_group
   group by r.partuur_group, t.name, t.played_on, t.location;
$$;

revoke all on function public.inschrijving_bevestiging(uuid) from public;
grant execute on function public.inschrijving_bevestiging(uuid) to kv_api;
