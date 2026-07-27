-- A payment reference belongs to a partuur, not to a speler.
--
-- 0011 made betaling_referentie unique, on the assumption that one reference means one
-- row. That is wrong: a partuur is two or three registration rows sharing a single
-- inleggeld, so linking a checkout writes the same reference to all of them and trips
-- the constraint.
--
-- Uniqueness was there to stop a redelivered webhook being applied twice. It was never
-- needed for that: the webhook performs an UPDATE to a fixed status, which is idempotent
-- whether it touches one row or three. Applying it twice writes the same values again.
--
-- So the index becomes a plain lookup index — which is what the webhook actually needs.

drop index if exists public.tournament_registrations_betaling_referentie_key;

create index if not exists tournament_registrations_betaling_referentie_idx
  on public.tournament_registrations (betaling_referentie)
  where betaling_referentie is not null;

comment on column public.tournament_registrations.betaling_referentie is
  'Provider reference for the inleggeld. Shared by every row of a partuur, since the '
  'payment is one payment. Not unique: the webhook is idempotent by being an UPDATE to '
  'a fixed status.';
