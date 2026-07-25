-- KV Eendracht — Row Level Security
-- Migratie 3. Per tabel gedocumenteerd: wie mag lezen/toevoegen/wijzigen/verwijderen.

-- ---------------------------------------------------------------- profiles
-- Lezen: eigen rij; moderators/admins alles. Publiek gebruikt v_profiles_public.
-- Insert: via signup-trigger (security definer). Update: eigen display_name;
-- rollen alleen door admin (super_admin vereist voor admin-rollen). Delete: nooit.
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_moderator());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles p2 where p2.id = auth.uid())
    and is_blocked = (select is_blocked from public.profiles p2 where p2.id = auth.uid())
    and match_entry_rights = (select match_entry_rights from public.profiles p2 where p2.id = auth.uid())
  );

create policy profiles_admin_update on public.profiles
  for update using (public.is_admin())
  with check (
    public.is_admin()
    and (
      -- alleen super_admin mag admin/super_admin toekennen of afnemen
      public.current_app_role() = 'super_admin'
      or role not in ('admin','super_admin')
    )
  );

-- ---------------------------------------------------------------- blocked_users
-- Lezen/schrijven: alleen moderators/admins.
alter table public.blocked_users enable row level security;
create policy blocked_mod_all on public.blocked_users
  for all using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------- player_profiles
-- Lezen: alleen beheer (publiek leest v_players_public zonder contactgegevens).
-- Schrijven: alleen beheer. Verwijderen: niet (archiveren via update).
alter table public.player_profiles enable row level security;
create policy players_admin_select on public.player_profiles
  for select using (public.is_admin());
create policy players_admin_insert on public.player_profiles
  for insert with check (public.is_admin());
create policy players_admin_update on public.player_profiles
  for update using (public.is_admin()) with check (public.is_admin());
grant select on public.v_players_public to anon, authenticated;
grant select on public.v_profiles_public to anon, authenticated;

-- ---------------------------------------------------------------- seasons
alter table public.seasons enable row level security;
create policy seasons_read on public.seasons for select using (true);
create policy seasons_admin_write on public.seasons
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- competitions
-- Lezen: publiek indien public+published/active/finished; beheer alles.
alter table public.competitions enable row level security;
create policy competitions_read on public.competitions
  for select using (
    (visibility = 'public' and status in ('published','active','finished'))
    or public.is_admin()
  );
create policy competitions_admin_write on public.competitions
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.competition_players enable row level security;
create policy comp_players_read on public.competition_players
  for select using (
    exists (select 1 from public.competitions c where c.id = competition_id
            and ((c.visibility = 'public' and c.status in ('published','active','finished'))
                 or public.is_admin()))
  );
create policy comp_players_admin_write on public.competition_players
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.competition_rounds enable row level security;
create policy rounds_read on public.competition_rounds
  for select using (
    exists (select 1 from public.competitions c where c.id = competition_id
            and ((c.visibility = 'public' and c.status in ('published','active','finished'))
                 or public.is_admin()))
  );
create policy rounds_admin_write on public.competition_rounds
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- attendance
-- Lezen: publiek (aanwezigheid is onderdeel van de stand; bevat geen contactgegevens).
-- Schrijven: beheer of via RPC's (security definer).
alter table public.attendance enable row level security;
create policy attendance_read on public.attendance for select using (true);
create policy attendance_admin_write on public.attendance
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- tournaments
alter table public.tournaments enable row level security;
create policy tournaments_read on public.tournaments
  for select using (
    (visibility = 'public' and status in ('published','live','finished','cancelled'))
    or public.is_admin()
  );
create policy tournaments_admin_write on public.tournaments
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.tournament_registrations enable row level security;
create policy regs_read on public.tournament_registrations
  for select using (
    exists (select 1 from public.tournaments t where t.id = tournament_id
            and ((t.visibility = 'public' and t.status <> 'draft') or public.is_admin()))
  );
create policy regs_admin_write on public.tournament_registrations
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- teams / members / matches / results
alter table public.teams enable row level security;
create policy teams_read on public.teams
  for select using (
    tournament_id is null
    or exists (select 1 from public.tournaments t where t.id = tournament_id
               and ((t.visibility = 'public' and t.status <> 'draft') or public.is_admin()))
  );
create policy teams_admin_write on public.teams
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.team_members enable row level security;
create policy team_members_read on public.team_members for select using (true);
create policy team_members_admin_write on public.team_members
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.matches enable row level security;
create policy matches_read on public.matches
  for select using (
    (tournament_id is null or exists
      (select 1 from public.tournaments t where t.id = tournament_id
       and ((t.visibility = 'public' and t.status <> 'draft') or public.is_admin())))
  );
create policy matches_write on public.matches
  for all using (public.can_enter_results()) with check (public.can_enter_results());

-- Uitslagen: lezen publiek; schrijven uitsluitend via RPC apply_match_result
-- (security definer). Directe insert alleen beheer/wedstrijdrechten.
alter table public.match_results enable row level security;
create policy results_read on public.match_results for select using (true);
create policy results_write on public.match_results
  for all using (public.can_enter_results()) with check (public.can_enter_results());

-- Standen: lezen publiek; schrijven alleen via RPC (geen directe policies).
alter table public.standings enable row level security;
create policy standings_read on public.standings for select using (true);
create policy standings_admin_write on public.standings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- agenda
alter table public.agenda_events enable row level security;
create policy agenda_read on public.agenda_events
  for select using (is_published or public.is_admin());
create policy agenda_admin_write on public.agenda_events
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- nieuws
alter table public.news_posts enable row level security;
create policy news_read on public.news_posts
  for select using (
    (status = 'published' and published_at <= now())
    or (status = 'scheduled' and published_at <= now()) -- geplande publicatie
    or public.is_admin()
  );
create policy news_admin_write on public.news_posts
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.news_media enable row level security;
create policy news_media_read on public.news_media
  for select using (
    exists (select 1 from public.news_posts n where n.id = news_post_id
            and ((n.status in ('published','scheduled') and n.published_at <= now()) or public.is_admin()))
  );
create policy news_media_admin_write on public.news_media
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- forum
alter table public.forum_categories enable row level security;
create policy forum_cat_read on public.forum_categories
  for select using (is_active or public.is_moderator());
create policy forum_cat_admin_write on public.forum_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- Topics: approved leest iedereen; eigen pending leest auteur; moderator alles.
-- Insert: ingelogd (ook anoniem), niet geblokkeerd, community aan, eigen author_id.
-- Update: auteur (inhoud, korte tijd, via kolomcheck in app) of moderator.
alter table public.forum_topics enable row level security;
create policy topics_read on public.forum_topics
  for select using (
    (moderation_status = 'approved' and deleted_at is null)
    or author_id = auth.uid()
    or public.is_moderator()
  );
create policy topics_insert on public.forum_topics
  for insert with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and not public.is_blocked()
    and public.feature_enabled('forum')
    and is_pinned = false and is_locked = false
  );
create policy topics_update_own on public.forum_topics
  for update using (author_id = auth.uid() and deleted_at is null)
  with check (author_id = auth.uid() and is_pinned = false and is_locked = false);
create policy topics_moderate on public.forum_topics
  for update using (public.is_moderator()) with check (public.is_moderator());
create policy topics_delete_mod on public.forum_topics
  for delete using (public.is_moderator());

alter table public.forum_replies enable row level security;
create policy replies_read on public.forum_replies
  for select using (
    (moderation_status = 'approved' and deleted_at is null)
    or author_id = auth.uid()
    or public.is_moderator()
  );
create policy replies_insert on public.forum_replies
  for insert with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and not public.is_blocked()
    and public.feature_enabled('replies')
    and exists (select 1 from public.forum_topics t
                where t.id = topic_id and not t.is_locked and t.deleted_at is null)
  );
create policy replies_update_own on public.forum_replies
  for update using (author_id = auth.uid() and deleted_at is null)
  with check (author_id = auth.uid());
create policy replies_moderate on public.forum_replies
  for update using (public.is_moderator()) with check (public.is_moderator());
create policy replies_delete_mod on public.forum_replies
  for delete using (public.is_moderator());

-- ---------------------------------------------------------------- reactions (likes)
alter table public.reactions enable row level security;
create policy reactions_read on public.reactions for select using (true);
create policy reactions_insert on public.reactions
  for insert with check (
    auth.uid() is not null and user_id = auth.uid()
    and not public.is_blocked() and public.feature_enabled('likes')
  );
create policy reactions_delete_own on public.reactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------- polls
alter table public.polls enable row level security;
create policy polls_read on public.polls
  for select using (status = 'published' or public.is_admin());
create policy polls_admin_write on public.polls
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.poll_options enable row level security;
create policy poll_options_read on public.poll_options
  for select using (
    exists (select 1 from public.polls p where p.id = poll_id
            and (p.status = 'published' or public.is_admin()))
  );
create policy poll_options_admin_write on public.poll_options
  for all using (public.is_admin()) with check (public.is_admin());

-- Stemmen: eigen stem lezen; totalen via v_poll_results. 1 stem per gebruiker
-- (unique constraint) en alleen op open, gepubliceerde peilingen.
alter table public.poll_votes enable row level security;
create policy poll_votes_read_own on public.poll_votes
  for select using (user_id = auth.uid() or public.is_admin());
create policy poll_votes_insert on public.poll_votes
  for insert with check (
    auth.uid() is not null and user_id = auth.uid()
    and not public.is_blocked() and public.feature_enabled('polls')
    and exists (select 1 from public.polls p
                where p.id = poll_id and p.status = 'published' and not p.is_closed
                  and p.starts_at <= now()
                  and (p.ends_at is null or p.ends_at > now()))
  );
grant select on public.v_poll_results to anon, authenticated;

-- ---------------------------------------------------------------- media
alter table public.media_uploads enable row level security;
create policy media_read on public.media_uploads
  for select using (
    moderation_status = 'approved'
    or uploader_id = auth.uid()
    or public.is_moderator()
  );
create policy media_insert on public.media_uploads
  for insert with check (
    auth.uid() is not null and uploader_id = auth.uid()
    and not public.is_blocked() and public.feature_enabled('photos')
    and storage_path like auth.uid()::text || '/%'
  );
create policy media_moderate on public.media_uploads
  for update using (public.is_moderator()) with check (public.is_moderator());
create policy media_delete on public.media_uploads
  for delete using (uploader_id = auth.uid() or public.is_moderator());

-- ---------------------------------------------------------------- reports
alter table public.reports enable row level security;
create policy reports_read on public.reports
  for select using (reporter_id = auth.uid() or public.is_moderator());
create policy reports_insert on public.reports
  for insert with check (
    auth.uid() is not null and reporter_id = auth.uid() and not public.is_blocked()
  );
create policy reports_moderate on public.reports
  for update using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------- settings / audit / rate limits
alter table public.app_settings enable row level security;
create policy settings_read_public on public.app_settings
  for select using (is_public or public.is_admin());
create policy settings_admin_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.audit_logs enable row level security;
create policy audit_admin_read on public.audit_logs
  for select using (public.is_admin());
-- inserts gebeuren via security definer triggers; geen directe insert-policy

alter table public.rate_limit_events enable row level security;
create policy rate_limit_admin_read on public.rate_limit_events
  for select using (public.is_admin());


-- ---------------------------------------------------------------- storage
-- The storage.objects policies are gone: object storage is MinIO now, not Postgres.
-- Their guarantees move into the API's storage module, which mints presigned PUT URLs
-- with the key prefix forced to `<userId>/` plus content-type and 5 MB conditions --
-- the same rules the old policies enforced, applied before the signature is issued.
-- See docs/Decisions/ADR-0006-minio-for-object-storage.md.
-- Bucket creation lives in infra/docker-compose.yml (the minio-init service).
