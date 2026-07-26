-- Competition standings switch to the KNKB 7-punten rule.
--
-- Until now the competition summed the raw eersten a partuur scored, so a 6-4 win
-- contributed 6 voor and 4 tegen. The club's rule — already used for poules in
-- computePouleStanding, and the one the KNKB applies — is:
--
--   winner: 7 eersten voor, the loser's eersten as tegen
--   loser:  own eersten voor, 7 as tegen
--
-- Worked example, uitslag 5-5 then 6-2 in the deciding eerst (final eersten 6-5):
--   Partuur 1 (winner): 7 voor, 5 tegen
--   Partuur 2 (loser):  5 voor, 7 tegen
--
-- The 7 is deliberately more than the 6 eersten actually needed to win. That is the
-- point of the rule: it rewards winning over merely accumulating eersten, while a
-- narrow 5-6 loss still banks 5 — which keeps an outclassed partuur playing hard to
-- the end rather than giving up once the match is gone.
--
-- Draws keep their raw eersten on both sides: there is no winner to award 7 to. A
-- regular partij cannot end level (the CHECK constraints reject 6-6), so this only
-- applies to formats that explicitly allow one.
--
-- packages/domain/src/competitie/standings.ts mirrors this and changes in the same
-- commit, along with its tests — required by KV-EENDRACHT-APP-SPEC section 12 rule 4.

create or replace function public.recalculate_standings(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders mogen standen herberekenen';
  end if;

  update public.standings s
     set previous_position = position
   where s.competition_id = p_competition_id;

  insert into public.standings (competition_id, player_id)
  select cp.competition_id, cp.player_id
    from public.competition_players cp
   where cp.competition_id = p_competition_id
  on conflict (competition_id, player_id) do nothing;

  with player_match as (
    select tm.player_id,
           -- KNKB: the winner banks 7 regardless of the eersten they actually scored;
           -- the loser banks what they scored. Tegen mirrors the opponent's voor.
           case
             when r.winner is null or r.winner = 'draw'
               then case when tm2.side = 'red' then r.eersten_red else r.eersten_white end
             when r.winner = tm2.side then 7
             else case when tm2.side = 'red' then r.eersten_red else r.eersten_white end
           end as voor,
           case
             when r.winner is null or r.winner = 'draw'
               then case when tm2.side = 'red' then r.eersten_white else r.eersten_red end
             when r.winner = tm2.side
               then case when tm2.side = 'red' then r.eersten_white else r.eersten_red end
             else 7
           end as tegen,
           case when r.winner = tm2.side then 1 else 0 end as won,
           case when r.winner is not null and r.winner <> 'draw' and r.winner <> tm2.side
                then 1 else 0 end as lost
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
