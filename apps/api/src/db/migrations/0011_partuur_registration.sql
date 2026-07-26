-- Registering as a complete partuur, for Vrije Formatie and Pearke.
--
-- Those two categories are not drawn: the spelers arrive already paired up, and the
-- club just needs to know which parturen turn up. D.E.L. is the opposite — individuals
-- register and the loting forms the parturen afterwards.
--
-- Modelled as a shared group id on the existing per-speler rows rather than a separate
-- table. Every registration is still one speler, so the participant list, the withdrawal
-- rule and all four existing RLS policies keep working untouched; a partuur is simply
-- the set of rows that share a group. A second table would have duplicated all of that
-- and left two ways to be registered.

alter table public.tournament_registrations
  add column if not exists partuur_group uuid;

comment on column public.tournament_registrations.partuur_group is
  'Shared by the spelers who registered together as one partuur (Vrije Formatie, '
  'Pearke). NULL for an individual registration, which is how D.E.L. works.';

create index if not exists idx_registrations_partuur
  on public.tournament_registrations(tournament_id, partuur_group);

/**
 * True when this wedstrijd expects complete parturen rather than individuals.
 *
 * Kept as a function so the rule lives in one place: the API, the RLS policy and any
 * future report all ask the same question rather than each hardcoding the list.
 */
create or replace function public.registers_as_partuur(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournaments t
     where t.id = p_tournament_id
       and t.formation_category in ('vrije_formatie', 'vrije_formatie_beperkt', 'pearke')
  );
$$;
