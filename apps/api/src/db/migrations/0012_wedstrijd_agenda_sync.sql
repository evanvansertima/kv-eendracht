-- Every wedstrijd appears in the agenda, automatically and permanently in step.
--
-- Done as a trigger rather than in the API on purpose. The agenda item is not an
-- optional extra that a caller may forget: a wedstrijd the club cannot see in the agenda
-- is, for practical purposes, a wedstrijd that is not happening. A trigger holds for the
-- seed script, for a psql session and for any future endpoint, where API-side logic
-- holds only for the one code path that remembers it.
--
-- tournaments.agenda_event_id already existed for this link and was never populated.

create or replace function public.sync_wedstrijd_agenda()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid;
  v_starts_at timestamptz;
  v_beschrijving text;
begin
  -- A wedstrijd stores the day and the aanvangstijd separately: played_on is a date and
  -- starts_at is a *time*, not a timestamp. The agenda needs one moment, so the two are
  -- combined and interpreted in Europe/Amsterdam — which is what makes a wedstrijd in
  -- July and one in December both show the clock time the club actually meant.
  --
  -- 10:00 is the usual start when no aanvangstijd is set.
  v_starts_at := (
    (new.played_on + coalesce(new.starts_at, time '10:00')) at time zone 'Europe/Amsterdam'
  );

  v_beschrijving := coalesce(new.description, '')
    || case
         when new.inleggeld_cents is null then E'\n\nInleggeld: gratis'
         else E'\n\nInleggeld: € ' || to_char(new.inleggeld_cents / 100.0, 'FM999G999D00')
       end;

  if tg_op = 'INSERT' or new.agenda_event_id is null then
    insert into public.agenda_events
      (title, description, event_type, starts_at, location, tournament_id, is_published)
    values
      (new.name, v_beschrijving, 'Wedstrijd', v_starts_at, new.location, new.id,
       new.status <> 'draft')
    returning id into v_event_id;

    -- Written directly rather than through NEW, because on UPDATE the row has already
    -- been chosen and assigning to NEW would not persist.
    update public.tournaments set agenda_event_id = v_event_id where id = new.id;
  else
    update public.agenda_events
       set title        = new.name,
           description  = v_beschrijving,
           starts_at    = v_starts_at,
           location     = new.location,
           is_published = new.status <> 'draft'
     where id = new.agenda_event_id;
  end if;

  return null;
end $$;

-- AFTER, so the tournaments row exists before the agenda item references it.
drop trigger if exists trg_wedstrijd_agenda_insert on public.tournaments;
create trigger trg_wedstrijd_agenda_insert
  after insert on public.tournaments
  for each row execute function public.sync_wedstrijd_agenda();

-- Only the fields the agenda item actually shows. Without this column list the trigger
-- would re-fire on its own agenda_event_id write and recurse.
drop trigger if exists trg_wedstrijd_agenda_update on public.tournaments;
create trigger trg_wedstrijd_agenda_update
  after update of name, description, played_on, starts_at, location, status, inleggeld_cents
  on public.tournaments
  for each row execute function public.sync_wedstrijd_agenda();

-- Removing a wedstrijd removes its agenda item.
--
-- Both foreign keys between these tables are ON DELETE SET NULL, so without this the
-- agenda would keep an item for a wedstrijd that no longer exists, with its link quietly
-- blanked — an entry nobody can trace back or clean up.
--
-- AFTER, not BEFORE. A BEFORE trigger deleting the agenda item fires
-- fk_tournaments_agenda's SET NULL against the tournaments row that is mid-delete, and
-- Postgres refuses with "tuple to be deleted was already modified by an operation
-- triggered by the current command". By AFTER the row is gone and the cascade has
-- nothing left to touch, while OLD still carries the id we need.
create or replace function public.remove_wedstrijd_agenda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.agenda_event_id is not null then
    delete from public.agenda_events where id = old.agenda_event_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_wedstrijd_agenda_delete on public.tournaments;
create trigger trg_wedstrijd_agenda_delete
  after delete on public.tournaments
  for each row execute function public.remove_wedstrijd_agenda();
