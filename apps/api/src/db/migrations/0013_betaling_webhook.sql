-- Applying a payment status from a provider webhook.
--
-- A webhook arrives with no user session: the provider is a server, not a member. But
-- the UPDATE policy on tournament_registrations requires is_admin(), so a plain update
-- from the webhook handler is silently filtered to zero rows — the request succeeds, the
-- club sees nothing, and the member who paid stays marked unpaid.
--
-- SECURITY DEFINER is the right mechanism, and the one this schema already uses for
-- apply_match_result and finalize_round: a narrow, audited function that does exactly
-- one thing, rather than widening a policy or giving the API a privileged role.
--
-- Narrow means narrow. It can only be reached with a betaling_referentie, which the
-- provider issued and only the provider knows, and it can only move the betaalstatus.

create or replace function public.apply_betaalstatus(
  p_referentie text,
  p_status public.betaalstatus
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_referentie is null or length(p_referentie) < 8 then
    raise exception 'Ongeldige betalingsreferentie';
  end if;

  -- Matched on the unique betaling_referentie, so a redelivered webhook lands on the
  -- same rows and simply rewrites the same value. Idempotent by construction.
  update public.tournament_registrations
     set betaalstatus = p_status,
         betaald_op = case
                        when p_status = 'paid' then coalesce(betaald_op, now())
                        else betaald_op
                      end,
         -- A paid registration is confirmed automatically; that is the point of
         -- requiring payment. Other statuses leave any manual confirmation alone.
         bevestigd_op = case
                          when p_status = 'paid' then coalesce(bevestigd_op, now())
                          else bevestigd_op
                        end
   where betaling_referentie = p_referentie;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function public.apply_betaalstatus(text, public.betaalstatus) is
  'Applies a payment status from a provider webhook. SECURITY DEFINER because a webhook '
  'has no user session and the UPDATE policy requires is_admin(). Idempotent: keyed on '
  'the unique betaling_referentie.';

revoke all on function public.apply_betaalstatus(text, public.betaalstatus) from public;
grant execute on function public.apply_betaalstatus(text, public.betaalstatus) to kv_api;
