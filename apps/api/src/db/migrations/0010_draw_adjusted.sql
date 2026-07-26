-- Records that a published loting was adjusted by hand after being drawn.
--
-- The publish endpoint re-runs the draw from the stored seed and refuses any mismatch
-- (ADR-0001), which is what makes tournaments.draw_seed a verifiable fact rather than
-- an unchecked claim. Manual editing breaks that property by definition: once a
-- beheerder has moved a speler, the seed alone no longer reproduces the parturen.
--
-- Rather than weaken the check for everyone, the two cases are distinguished. An
-- untouched loting stays fully reproducible and is verified as before. An adjusted one
-- skips verification and is flagged, so anyone reading the parturen later can see that
-- the seed does not tell the whole story.
--
-- The alternative — silently accepting edited teams — would leave a seed that looks
-- authoritative and is not, which is worse than having no seed at all.

alter table public.tournaments
  add column if not exists draw_manually_adjusted boolean not null default false;

comment on column public.tournaments.draw_manually_adjusted is
  'True when a beheerder changed the parturen after the loting. The stored draw_seed '
  'then no longer reproduces them, and the publish endpoint skips seed verification '
  'for this wedstrijd.';
