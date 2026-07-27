-- Linking a checkout to a registration.
--
-- Same trap as the webhook, found the same way. After creating a public inschrijving the
-- API stored the provider reference and moved the status to 'pending' with a plain
-- UPDATE and no claims — and the UPDATE policy requires is_admin(), so it matched zero
-- rows and returned success. The registration stayed 'unpaid' with no reference, which
-- then made every later webhook unmatchable.
--
-- Nothing errored at any point. That is the whole danger of relying on a policy-filtered
-- write: the failure mode is silence.

create or replace function public.koppel_betaling(
  p_group uuid,
  p_referentie text,
  p_bedrag_cents integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.tournament_registrations
     set betaalstatus = 'pending',
         betaling_referentie = p_referentie,
         betaald_cents = p_bedrag_cents
   where partuur_group = p_group;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Inschrijving niet gevonden voor deze betaling';
  end if;

  return v_count;
end $$;

revoke all on function public.koppel_betaling(uuid, text, integer) from public;
grant execute on function public.koppel_betaling(uuid, text, integer) to kv_api;
