-- Allow bracket placeholder matches to exist before their parturen are known.
--
-- The v1 constraint was:
--
--   check (team_red_id is distinct from team_white_id)
--
-- Its intent is sound — a partuur must never play itself. But `NULL IS DISTINCT FROM
-- NULL` evaluates to FALSE, so the constraint also forbids a match where *neither* side
-- is known yet.
--
-- That is exactly what a knock-out bracket needs. Rounds beyond the first are generated
-- up front with both sides empty, so that next_match_id has a row to point at and
-- apply_match_result can advance the winner without the client computing where it goes.
-- Without those placeholders there is no bracket to advance through.
--
-- v1 never hit this because it only ever generated the first round on publish — see the
-- Sneker limitation in KV-EENDRACHT-APP-SPEC section 15. Generating full brackets
-- surfaces it immediately.
--
-- The replacement keeps the real rule and drops the accidental one: two known parturen
-- must differ; an unknown side is simply not yet decided.

alter table public.matches drop constraint if exists matches_check1;

alter table public.matches
  add constraint matches_distinct_teams
  check (
    team_red_id is null
    or team_white_id is null
    or team_red_id <> team_white_id
  );

comment on constraint matches_distinct_teams on public.matches is
  'A partuur cannot play itself. NULL means "not yet determined" — required for '
  'knock-out placeholders in rounds beyond the first.';
