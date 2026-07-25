-- KV Eendracht — schema
-- Migratie 1: tabellen, constraints, indexes, triggers

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Kaatsvriend' check (char_length(display_name) between 2 and 32),
  role text not null default 'guest' check (role in ('guest','moderator','admin','super_admin')),
  is_anonymous boolean not null default false,
  is_blocked boolean not null default false,
  match_entry_rights boolean not null default false, -- moderator mag uitslagen invoeren
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- profiel automatisch aanmaken bij signup (ook anoniem)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_anonymous)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Kaatsvriend'),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  blocked_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_blocked_users_user on public.blocked_users(user_id);

-- ---------------------------------------------------------------- spelers
create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  infix text,
  last_name text not null,
  display_name text generated always as (
    first_name || case when infix is null or infix = '' then ' ' else ' ' || infix || ' ' end || last_name
  ) stored,
  birth_date date,
  age_category text, -- vrij: 'Welpen','Pupillen','Schooljeugd','Jeugd','Senioren','55+'
  gender text check (gender in ('dame','heer','anders') or gender is null),
  skill_level text check (skill_level in ('A','B','C') or skill_level is null),
  club text not null default 'KV Eendracht',
  is_active boolean not null default true,
  phone text,          -- RLS: alleen beheer (kolomsplitsing via view)
  email text,          -- RLS: alleen beheer
  photo_url text,
  admin_notes text,    -- RLS: alleen beheer
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_players_updated before update on public.player_profiles
  for each row execute function public.set_updated_at();
create index idx_players_name on public.player_profiles(last_name, first_name);
create index idx_players_active on public.player_profiles(is_active) where archived_at is null;

-- ---------------------------------------------------------------- competitie
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- '2026'
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_seasons_updated before update on public.seasons
  for each row execute function public.set_updated_at();

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  name text not null,
  category text not null default 'gemengd', -- heren/dames/jeugd/gemengd/…
  starts_on date,
  ends_on date,
  status text not null default 'draft' check (status in ('draft','published','active','finished','archived')),
  visibility text not null default 'public' check (visibility in ('public','members','private')),
  standings_config jsonb not null default '{"order":["eersten_voor_desc","eersten_tegen_asc","saldo_desc","deelnames_desc","naam_asc"]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_competitions_updated before update on public.competitions
  for each row execute function public.set_updated_at();
create index idx_competitions_season on public.competitions(season_id);
create index idx_competitions_status on public.competitions(status);

create table public.competition_players (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, player_id)
);
create trigger trg_comp_players_updated before update on public.competition_players
  for each row execute function public.set_updated_at();
create index idx_comp_players_comp on public.competition_players(competition_id);

create table public.competition_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_no int not null,
  played_on date not null,
  status text not null default 'open' check (status in ('open','finalized')),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, round_no)
);
create trigger trg_rounds_updated before update on public.competition_rounds
  for each row execute function public.set_updated_at();
create index idx_rounds_comp on public.competition_rounds(competition_id, played_on);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  status text not null check (status in ('present','absent','excused','injured','guest')),
  source text not null default 'auto' check (source in ('auto','manual')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id) -- max 1 aanwezigheidstelling per speler per avond
);
create trigger trg_attendance_updated before update on public.attendance
  for each row execute function public.set_updated_at();
create index idx_attendance_round on public.attendance(round_id);
create index idx_attendance_player on public.attendance(player_id);

-- ---------------------------------------------------------------- toernooien
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  played_on date not null,
  starts_at time,
  location text,
  registration_open boolean not null default false,
  match_system text not null check (match_system in
    ('knockout','knockout_consolation','poule','competition','sneker')),
  formation_category text not null check (formation_category in
    ('vrije_formatie','del','del_abc','vrije_formatie_beperkt','twee_tegen_twee','pearke')),
  team_size int not null default 3 check (team_size between 1 and 4),
  available_courts int not null default 2 check (available_courts between 1 and 20),
  third_place_match boolean not null default false,
  consolation_mode text check (consolation_mode in ('original_teams','redraw') or consolation_mode is null),
  poule_config jsonb not null default '{}', -- {"poules":2,"size":4,"max_teams":8,"club_override":false,"tiebreak":["tegeneersten","onderling"]}
  sneker_config jsonb not null default '{}', -- zie app_settings default
  restrictions jsonb not null default '{}', -- vrije formatie beperkt: {"max_teams":12,"levels":["A","B"],...}
  abc_strict boolean not null default true,
  pearke_mixed_required boolean not null default true,
  status text not null default 'draft' check (status in ('draft','published','live','finished','cancelled')),
  visibility text not null default 'public' check (visibility in ('public','members','private')),
  draw_seed bigint,
  draw_published_at timestamptz,
  draw_published_by uuid references public.profiles(id),
  agenda_event_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tournaments_updated before update on public.tournaments
  for each row execute function public.set_updated_at();
create index idx_tournaments_date on public.tournaments(played_on desc);
create index idx_tournaments_status on public.tournaments(status);

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  status text not null default 'registered' check (status in ('registered','waitlist','reserve','withdrawn')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, player_id) -- speler max 1x per toernooi
);
create trigger trg_regs_updated before update on public.tournament_registrations
  for each row execute function public.set_updated_at();
create index idx_regs_tournament on public.tournament_registrations(tournament_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  competition_round_id uuid references public.competition_rounds(id) on delete cascade,
  team_no int not null, -- laagste nummer = opslag
  name text,
  captain_player_id uuid references public.player_profiles(id),
  poule_no int,
  bracket text not null default 'main' check (bracket in ('main','consolation')),
  is_bye boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tournament_id is not null or competition_round_id is not null)
);
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();
create index idx_teams_tournament on public.teams(tournament_id);
create index idx_teams_round on public.teams(competition_round_id);
create unique index uq_teams_no_per_tournament_bracket
  on public.teams(tournament_id, bracket, team_no) where tournament_id is not null;

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  role text not null default 'speler' check (role in ('speler','aanvoerder','vervanger')),
  replaced_by uuid references public.player_profiles(id),
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, player_id)
);
create trigger trg_team_members_updated before update on public.team_members
  for each row execute function public.set_updated_at();
create index idx_team_members_team on public.team_members(team_id);
create index idx_team_members_player on public.team_members(player_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  competition_round_id uuid references public.competition_rounds(id) on delete cascade,
  bracket text not null default 'main' check (bracket in ('main','consolation')),
  round_no int not null default 1,      -- omloop
  match_no int not null,                -- wedstrijdnummer binnen omloop
  sneker_round int,                     -- omloopnummer bij sneker
  poule_no int,
  court int,                            -- perk
  team_red_id uuid references public.teams(id),
  team_white_id uuid references public.teams(id),
  next_match_id uuid references public.matches(id),
  next_slot text check (next_slot in ('red','white') or next_slot is null),
  consolation_next_match_id uuid references public.matches(id),
  consolation_next_slot text check (consolation_next_slot in ('red','white') or consolation_next_slot is null),
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tournament_id is not null or competition_round_id is not null),
  check (team_red_id is distinct from team_white_id)
);
create trigger trg_matches_updated before update on public.matches
  for each row execute function public.set_updated_at();
create index idx_matches_tournament on public.matches(tournament_id, bracket, round_no);
create index idx_matches_round on public.matches(competition_round_id);
create index idx_matches_status on public.matches(status);

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  eersten_red int not null default 0 check (eersten_red between 0 and 6),
  eersten_white int not null default 0 check (eersten_white between 0 and 6),
  points_last_eerst text, -- optioneel: spelpunten in het laatste eerst, bv '6-4'
  winner text check (winner in ('red','white','draw') or winner is null),
  note text,
  entered_by uuid references public.profiles(id),
  client_mutation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id),                    -- één uitslag per partij
  unique (client_mutation_id),          -- idempotentie bij retries
  check (not (winner = 'red' and winner = 'white')),
  check (winner is null or winner = 'draw'
         or (winner = 'red' and eersten_red >= eersten_white)
         or (winner = 'white' and eersten_white >= eersten_red))
);
create trigger trg_results_updated before update on public.match_results
  for each row execute function public.set_updated_at();
create index idx_results_match on public.match_results(match_id);

create table public.standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  eersten_voor int not null default 0,
  eersten_tegen int not null default 0,
  saldo int not null default 0,
  deelnames int not null default 0,
  afwezig int not null default 0,
  gespeeld int not null default 0,
  gewonnen int not null default 0,
  verloren int not null default 0,
  position int,
  previous_position int,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (competition_id, player_id)
);
create index idx_standings_comp on public.standings(competition_id, position);

-- ---------------------------------------------------------------- agenda
create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'overig', -- kaatswedstrijd/training/ledenpartij/vergadering/feest/jubileum/jeugd/vrijwilligers/overig (vrij uitbreidbaar)
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  image_url text,
  organizer text,
  audience text, -- doelgroep
  status text not null default 'gepland' check (status in ('gepland','gewijzigd','geannuleerd','afgelopen')),
  tournament_id uuid references public.tournaments(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_agenda_updated before update on public.agenda_events
  for each row execute function public.set_updated_at();
create index idx_agenda_starts on public.agenda_events(starts_at);
create index idx_agenda_published on public.agenda_events(is_published, starts_at);

-- ---------------------------------------------------------------- nieuws
create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro text,
  body text not null,
  hero_image_url text,
  author_id uuid references public.profiles(id),
  author_name text,
  category text not null default 'algemeen',
  is_featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  published_at timestamptz,
  comments_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_news_updated before update on public.news_posts
  for each row execute function public.set_updated_at();
create index idx_news_published on public.news_posts(status, published_at desc);

create table public.news_media (
  id uuid primary key default gen_random_uuid(),
  news_post_id uuid not null references public.news_posts(id) on delete cascade,
  image_url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_news_media_post on public.news_media(news_post_id);

-- ---------------------------------------------------------------- forum
create table public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_forum_cat_updated before update on public.forum_categories
  for each row execute function public.set_updated_at();

create table public.forum_topics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.forum_categories(id),
  author_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 3 and 140),
  body text not null check (char_length(body) between 1 and 8000),
  image_url text,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  moderation_status text not null default 'approved' check (moderation_status in ('pending','approved','rejected','hidden')),
  reply_count int not null default 0,
  like_count int not null default 0,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_topics_updated before update on public.forum_topics
  for each row execute function public.set_updated_at();
create index idx_topics_category on public.forum_topics(category_id, created_at desc);
create index idx_topics_moderation on public.forum_topics(moderation_status);

create table public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.forum_topics(id) on delete cascade,
  parent_id uuid references public.forum_replies(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  moderation_status text not null default 'approved' check (moderation_status in ('pending','approved','rejected','hidden')),
  like_count int not null default 0,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_replies_updated before update on public.forum_replies
  for each row execute function public.set_updated_at();
create index idx_replies_topic on public.forum_replies(topic_id, created_at);

-- max 1 niveau nesting: parent mag zelf geen parent hebben
create or replace function public.check_reply_depth()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.forum_replies where id = new.parent_id and parent_id is not null) then
      raise exception 'Reacties kunnen maar één niveau diep genest worden';
    end if;
  end if;
  return new;
end $$;
create trigger trg_reply_depth before insert or update on public.forum_replies
  for each row execute function public.check_reply_depth();

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('forum_topic','forum_reply','news_post','media_upload')),
  subject_id uuid not null,
  kind text not null default 'like',
  created_at timestamptz not null default now(),
  unique (user_id, subject_type, subject_id)
);
create index idx_reactions_subject on public.reactions(subject_type, subject_id);

-- ---------------------------------------------------------------- peilingen
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  results_visible text not null default 'after_vote' check (results_visible in ('always','after_vote','after_close')),
  is_closed boolean not null default false,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_polls_updated before update on public.polls
  for each row execute function public.set_updated_at();

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_poll_options_poll on public.poll_options(poll_id);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id) -- één stem per gebruiker per peiling
);
create index idx_poll_votes_poll on public.poll_votes(poll_id);

-- ---------------------------------------------------------------- media
create table public.media_uploads (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  rejection_reason text, -- alleen beheer zichtbaar
  moderated_by uuid references public.profiles(id),
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_media_updated before update on public.media_uploads
  for each row execute function public.set_updated_at();
create index idx_media_status on public.media_uploads(moderation_status, created_at desc);

-- ---------------------------------------------------------------- moderatie
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('forum_topic','forum_reply','media_upload','profile','news_post')),
  subject_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_reports_updated before update on public.reports
  for each row execute function public.set_updated_at();
create index idx_reports_status on public.reports(status);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default true,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_settings_updated before update on public.app_settings
  for each row execute function public.set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_table on public.audit_logs(table_name, record_id);
create index idx_audit_created on public.audit_logs(created_at desc);

create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index idx_rate_limit on public.rate_limit_events(user_id, action, created_at desc);

-- fk agenda→tournament al gelegd; omgekeerde koppeling:
alter table public.tournaments
  add constraint fk_tournaments_agenda foreign key (agenda_event_id)
  references public.agenda_events(id) on delete set null;

-- ---------------------------------------------------------------- defaults
insert into public.app_settings (key, value, is_public) values
  ('community_features', '{"forum":true,"replies":true,"photos":true,"polls":true,"likes":true}', true),
  ('rate_limits', '{"forum_topic":{"max":3,"window_minutes":60},"forum_reply":{"max":10,"window_minutes":60},"media_upload":{"max":5,"window_minutes":60},"report":{"max":10,"window_minutes":60}}', false),
  ('knkb_poule_max_teams', '8', true),
  ('poule_rules_default', '{"win_points":7,"loser_points":"eersten","tiebreak":["tegeneersten","onderling"]}', true),
  ('sneker_default', '{"rounds":3,"win_points":7,"loser_points":"eersten","tiebreak":["tegeneersten"],"rotate_teammates":true,"rotate_opponents":true,"max_repeat_pairings":1}', true),
  ('standings_order_default', '["eersten_voor_desc","eersten_tegen_asc","saldo_desc","deelnames_desc","naam_asc"]', true),
  ('upload_limits', '{"max_bytes":5242880,"allowed_types":["image/jpeg","image/png","image/webp"]}', true),
  ('reply_edit_window_minutes', '30', true);
