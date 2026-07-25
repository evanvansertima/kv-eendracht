-- KV Eendracht — seed data (fictional people and data only)
-- Run with: pnpm db:seed
--
-- Rewritten for our own auth schema: v1 targeted Supabase's auth.users, which has
-- instance_id, aud and raw_app_meta_data columns that our shim does not carry.
-- See apps/api/src/db/migrations/0000_auth_shim.sql.
--
-- This also fixes a v1 limitation noted in the spec: those seeded rows were not
-- usable as real logins on hosted Supabase. Here they are, because we own the table.

-- ---------------------------------------------------------------- demo auth
-- LOCAL DEVELOPMENT ONLY. Demo admin password: 'Eendracht!2026'
--
-- Hashed with bcrypt via pgcrypto, because that is what SQL can do unaided. The auth
-- module will issue argon2id (ADR-0001), so it must either verify bcrypt for these
-- seeded rows or this seed must be regenerated at that point. Tracked in PROJECT_PLAN.
insert into auth.users (id, email, encrypted_password, raw_user_meta_data,
                        is_anonymous, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111',
   'beheer@kveendracht.nl',
   crypt('Eendracht!2026', gen_salt('bf')),
   '{"display_name":"Beheer KV"}',
   false, now(), now(), now()),
  -- Anonymous community member: no email, no password, is_anonymous true.
  -- The auth_users_credentials_ck constraint enforces exactly this shape.
  ('22222222-2222-4222-8222-222222222222',
   null, null,
   '{"display_name":"Kaatsfan88"}',
   true, null, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name, role, is_anonymous) values
  ('11111111-1111-4111-8111-111111111111', 'Beheer KV', 'super_admin', false),
  ('22222222-2222-4222-8222-222222222222', 'Kaatsfan88', 'guest', true)
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

-- ---------------------------------------------------------------- spelers (28, fictief)
insert into public.player_profiles (id, first_name, infix, last_name, birth_date, age_category, gender, skill_level) values
  ('00000000-0000-4000-8000-000000000001','Jelte',null,'Hiemstra','1995-03-12','Senioren','heer','A'),
  ('00000000-0000-4000-8000-000000000002','Ruurd','van der','Meer','1988-07-04','Senioren','heer','A'),
  ('00000000-0000-4000-8000-000000000003','Sybren',null,'Talsma','1999-11-23','Senioren','heer','A'),
  ('00000000-0000-4000-8000-000000000004','Femke',null,'Wiersma','1997-02-18','Senioren','dame','A'),
  ('00000000-0000-4000-8000-000000000005','Anna','de','Boer','2001-09-30','Senioren','dame','A'),
  ('00000000-0000-4000-8000-000000000006','Marrit',null,'Zijlstra','1994-05-06','Senioren','dame','A'),
  ('00000000-0000-4000-8000-000000000007','Douwe',null,'Kooistra','1992-12-01','Senioren','heer','B'),
  ('00000000-0000-4000-8000-000000000008','Tjerk','van','Dijk','1990-08-14','Senioren','heer','B'),
  ('00000000-0000-4000-8000-000000000009','Hessel',null,'Bergsma','1998-04-27','Senioren','heer','B'),
  ('00000000-0000-4000-8000-000000000010','Wietse',null,'Postma','1996-10-09','Senioren','heer','B'),
  ('00000000-0000-4000-8000-000000000011','Nynke',null,'Hoekstra','2000-01-15','Senioren','dame','B'),
  ('00000000-0000-4000-8000-000000000012','Baukje','van der','Wal','1993-06-21','Senioren','dame','B'),
  ('00000000-0000-4000-8000-000000000013','Sjoukje',null,'Dijkstra','1991-03-08','Senioren','dame','B'),
  ('00000000-0000-4000-8000-000000000014','Elske',null,'Terpstra','2002-07-19','Senioren','dame','B'),
  ('00000000-0000-4000-8000-000000000015','Pieter',null,'Boonstra','1985-09-02','Senioren','heer','C'),
  ('00000000-0000-4000-8000-000000000016','Auke','de','Vries','1979-11-11','55+','heer','C'),
  ('00000000-0000-4000-8000-000000000017','Sipke',null,'Veenstra','1983-02-25','Senioren','heer','C'),
  ('00000000-0000-4000-8000-000000000018','Jorrit',null,'Algra','2003-05-17','Senioren','heer','C'),
  ('00000000-0000-4000-8000-000000000019','Tessa',null,'Runia','2004-08-03','Senioren','dame','C'),
  ('00000000-0000-4000-8000-000000000020','Hiske',null,'Bruinsma','1987-12-28','Senioren','dame','C'),
  ('00000000-0000-4000-8000-000000000021','Lysbeth','van','Kammen','1999-04-10','Senioren','dame','C'),
  ('00000000-0000-4000-8000-000000000022','Ids',null,'Sytsma','2005-01-22','Jeugd','heer','C'),
  ('00000000-0000-4000-8000-000000000023','Rixt',null,'Feenstra','2005-06-14','Jeugd','dame','C'),
  ('00000000-0000-4000-8000-000000000024','Menno',null,'Halbertsma','1989-10-05','Senioren','heer','B'),
  ('00000000-0000-4000-8000-000000000025','Geartsje',null,'Roorda','1995-02-11','Senioren','dame','B'),
  ('00000000-0000-4000-8000-000000000026','Oane',null,'Wynia','1997-07-08','Senioren','heer','A'),
  ('00000000-0000-4000-8000-000000000027','Doutzen',null,'Elzinga','1998-09-26','Senioren','dame','A'),
  ('00000000-0000-4000-8000-000000000028','Steven','de','Jong','1993-03-31','Senioren','heer','C');

-- ---------------------------------------------------------------- seizoen + competitie
insert into public.seasons (id, name, starts_on, ends_on) values
  ('00000000-0000-4000-8000-000000000100','2026','2026-04-01','2026-09-30');

insert into public.competitions (id, season_id, name, category, starts_on, ends_on, status) values
  ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000100',
   'Ledencompetitie 2026','gemengd','2026-05-01','2026-09-15','active');

-- 16 deelnemers
insert into public.competition_players (competition_id, player_id)
select '00000000-0000-4000-8000-000000000101', id
from public.player_profiles
where id::text like '00000000-0000-4000-8000-0000000000%'
  and right(id::text, 2)::int between 1 and 16;

-- drie speelavonden
insert into public.competition_rounds (id, competition_id, round_no, played_on, status) values
  ('00000000-0000-4000-8000-000000000110','00000000-0000-4000-8000-000000000101',1,'2026-06-25','finalized'),
  ('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000101',2,'2026-07-02','finalized'),
  ('00000000-0000-4000-8000-000000000112','00000000-0000-4000-8000-000000000101',3,'2026-07-09','open');

-- speelavond 1: 4 parturen (2 partijen), spelers 1-12 aanwezig
insert into public.teams (id, competition_round_id, team_no) values
  ('00000000-0000-4000-8000-000000000120','00000000-0000-4000-8000-000000000110',1),
  ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000110',2),
  ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000110',3),
  ('00000000-0000-4000-8000-000000000123','00000000-0000-4000-8000-000000000110',4);
insert into public.team_members (team_id, player_id) values
  ('00000000-0000-4000-8000-000000000120','00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000120','00000000-0000-4000-8000-000000000007'),
  ('00000000-0000-4000-8000-000000000120','00000000-0000-4000-8000-000000000015'),
  ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000008'),
  ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000016'),
  ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000019'),
  ('00000000-0000-4000-8000-000000000123','00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000123','00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000123','00000000-0000-4000-8000-000000000020');

insert into public.matches (id, competition_round_id, round_no, match_no, court,
                            team_red_id, team_white_id, status, finished_at) values
  ('00000000-0000-4000-8000-000000000130','00000000-0000-4000-8000-000000000110',1,1,1,
   '00000000-0000-4000-8000-000000000120','00000000-0000-4000-8000-000000000121','finished', now() - interval '21 days'),
  ('00000000-0000-4000-8000-000000000131','00000000-0000-4000-8000-000000000110',1,2,2,
   '00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000123','finished', now() - interval '21 days');

insert into public.match_results (match_id, eersten_red, eersten_white, winner, entered_by, client_mutation_id) values
  ('00000000-0000-4000-8000-000000000130',6,4,'red','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000140'),
  ('00000000-0000-4000-8000-000000000131',3,6,'white','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000141');

-- aanwezigheid avond 1 (auto voor spelende deelnemers, absent voor rest)
insert into public.attendance (round_id, player_id, status, source)
select '00000000-0000-4000-8000-000000000110', tm.player_id, 'present', 'auto'
from public.team_members tm
join public.teams t on t.id = tm.team_id
where t.competition_round_id = '00000000-0000-4000-8000-000000000110'
on conflict do nothing;
insert into public.attendance (round_id, player_id, status, source)
select '00000000-0000-4000-8000-000000000110', cp.player_id, 'absent', 'auto'
from public.competition_players cp
where cp.competition_id = '00000000-0000-4000-8000-000000000101'
on conflict (round_id, player_id) do nothing;

-- speelavond 2: 2 parturen, kleinere opkomst
insert into public.teams (id, competition_round_id, team_no) values
  ('00000000-0000-4000-8000-000000000124','00000000-0000-4000-8000-000000000111',1),
  ('00000000-0000-4000-8000-000000000125','00000000-0000-4000-8000-000000000111',2);
insert into public.team_members (team_id, player_id) values
  ('00000000-0000-4000-8000-000000000124','00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000124','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000124','00000000-0000-4000-8000-000000000016'),
  ('00000000-0000-4000-8000-000000000125','00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000125','00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000125','00000000-0000-4000-8000-000000000015');
insert into public.matches (id, competition_round_id, round_no, match_no, court,
                            team_red_id, team_white_id, status, finished_at) values
  ('00000000-0000-4000-8000-000000000132','00000000-0000-4000-8000-000000000111',1,1,1,
   '00000000-0000-4000-8000-000000000124','00000000-0000-4000-8000-000000000125','finished', now() - interval '14 days');
insert into public.match_results (match_id, eersten_red, eersten_white, winner, entered_by, client_mutation_id) values
  ('00000000-0000-4000-8000-000000000132',6,5,'red','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000142');
insert into public.attendance (round_id, player_id, status, source)
select '00000000-0000-4000-8000-000000000111', tm.player_id, 'present', 'auto'
from public.team_members tm join public.teams t on t.id = tm.team_id
where t.competition_round_id = '00000000-0000-4000-8000-000000000111'
on conflict do nothing;
insert into public.attendance (round_id, player_id, status, source)
select '00000000-0000-4000-8000-000000000111', cp.player_id, 'absent', 'auto'
from public.competition_players cp
where cp.competition_id = '00000000-0000-4000-8000-000000000101'
on conflict (round_id, player_id) do nothing;

-- stand initieel vullen
insert into public.standings (competition_id, player_id)
select competition_id, player_id from public.competition_players
where competition_id = '00000000-0000-4000-8000-000000000101'
on conflict do nothing;

-- ---------------------------------------------------------------- toernooien
insert into public.tournaments (id, name, description, played_on, starts_at, location,
  match_system, formation_category, team_size, available_courts, status, registration_open) values
  ('00000000-0000-4000-8000-000000000200','Zomer D.E.L.-partij',
   'Gezellige door-elkaar-loten partij voor alle leden.','2026-07-19','10:00','Sportpark De Eendracht',
   'knockout','del',3,3,'published',true),
  ('00000000-0000-4000-8000-000000000201','D.E.L. ABC Partij',
   'Ieder partuur één A-, één B- en één C-maat.','2026-07-26','11:00','Sportpark De Eendracht',
   'knockout','del_abc',3,3,'published',true),
  ('00000000-0000-4000-8000-000000000202','Poulekaatsen Eendracht',
   'Twee poules van vier, kruisfinales.','2026-08-02','10:30','Sportpark De Eendracht',
   'poule','vrije_formatie',3,4,'published',false),
  ('00000000-0000-4000-8000-000000000203','Herkansingspartij',
   'Afvalsysteem met volwaardige herkansingsronde.','2026-08-16','10:00','Sportpark De Eendracht',
   'knockout_consolation','del',3,3,'published',true);

-- inschrijvingen voor de D.E.L.-partij (17 spelers → test verdeling 2/3-tallen)
insert into public.tournament_registrations (tournament_id, player_id)
select '00000000-0000-4000-8000-000000000200', id
from public.player_profiles
where right(id::text, 2)::int between 1 and 17;

-- inschrijvingen ABC (4 A, 4 B, 4 C → 4 parturen)
insert into public.tournament_registrations (tournament_id, player_id)
select '00000000-0000-4000-8000-000000000201', id
from public.player_profiles
where right(id::text, 2)::int in (1,2,3,4, 7,8,9,11, 15,16,17,19);

-- ---------------------------------------------------------------- agenda
insert into public.agenda_events (title, description, event_type, starts_at, ends_at,
  location, organizer, audience, is_published, tournament_id) values
  ('Zomer D.E.L.-partij','Door-elkaar-loten partij, opgave tot vrijdag 20:00.',
   'kaatswedstrijd','2026-07-19 08:00+00','2026-07-19 15:00+00',
   'Sportpark De Eendracht','Wedstrijdcommissie','Alle leden',true,'00000000-0000-4000-8000-000000000200'),
  ('Training jeugd','Wekelijkse jeugdtraining o.l.v. Jelte.',
   'training','2026-07-21 16:30+00','2026-07-21 18:00+00',
   'Sportpark De Eendracht','Jeugdcommissie','Jeugd',true,null),
  ('Competitieavond','Wekelijkse ledencompetitie, aanvang 19:00.',
   'kaatswedstrijd','2026-07-16 17:00+00','2026-07-16 20:30+00',
   'Sportpark De Eendracht','Wedstrijdcommissie','Competitiedeelnemers',true,null),
  ('Ledenvergadering','Halfjaarlijkse ALV in de kantine.',
   'vergadering','2026-08-20 17:30+00','2026-08-20 20:00+00',
   'Kantine De Eendracht','Bestuur','Alle leden',true,null),
  ('Slotfeest seizoen 2026','Barbecue en prijsuitreiking competitie.',
   'feest','2026-09-19 15:00+00','2026-09-19 21:00+00',
   'Kantine De Eendracht','Activiteitencommissie','Leden en vrijwilligers',true,null);

-- ---------------------------------------------------------------- nieuws
insert into public.news_posts (title, intro, body, author_id, author_name, category,
  is_featured, status, published_at) values
  ('Eendracht wint streekpartij',
   'Het partuur van Jelte Hiemstra pakte zondag de krans.',
   'Op een zonovergoten veld wist het partuur van Jelte Hiemstra, Douwe Kooistra en Pieter Boonstra de finale met 6-4 te winnen. In een spannende slotfase...',
   '11111111-1111-4111-8111-111111111111','Redactie','wedstrijden',true,'published', now() - interval '3 days'),
  ('Opgave zomer D.E.L. geopend',
   'Schrijf je in voor de gezelligste partij van het jaar.',
   'De opgave voor de zomer D.E.L.-partij van 19 juli is geopend. Opgeven kan tot vridag 20:00 via de wedstrijdcommissie of in de app.',
   '11111111-1111-4111-8111-111111111111','Wedstrijdcommissie','algemeen',false,'published', now() - interval '1 day'),
  ('Nieuwe ballenvangers geplaatst',
   'Dankzij onze vrijwilligers staan er nieuwe ballenvangers.',
   'Afgelopen zaterdag hebben acht vrijwilligers de nieuwe ballenvangers achter perk 1 en 2 geplaatst. Het bestuur bedankt iedereen hartelijk.',
   '11111111-1111-4111-8111-111111111111','Bestuur','vereniging',false,'published', now() - interval '7 days');

-- ---------------------------------------------------------------- forum
insert into public.forum_categories (id, name, description, sort_order) values
  ('00000000-0000-4000-8000-000000000300','Algemeen','Alles over de vereniging',1),
  ('00000000-0000-4000-8000-000000000301','Zachte bal','Zachte bal kaatsen',2),
  ('00000000-0000-4000-8000-000000000302','Wedstrijden','Uitslagen en verslagen',3),
  ('00000000-0000-4000-8000-000000000303','Jeugd','Jeugdzaken',4),
  ('00000000-0000-4000-8000-000000000304','Vrijwilligers','Hulp en klussen',5),
  ('00000000-0000-4000-8000-000000000305','Activiteiten','Feesten en evenementen',6),
  ('00000000-0000-4000-8000-000000000306','Vraag en aanbod','Materiaal en meer',7);

insert into public.forum_topics (id, category_id, author_id, title, body, moderation_status) values
  ('00000000-0000-4000-8000-000000000310','00000000-0000-4000-8000-000000000302',
   '22222222-2222-4222-8222-222222222222','Mooie finale zondag!',
   'Wat een partij was dat zondag. Complimenten aan beide parturen, vooral dat laatste eerst was zenuwslopend.','approved'),
  ('00000000-0000-4000-8000-000000000311','00000000-0000-4000-8000-000000000304',
   '11111111-1111-4111-8111-111111111111','Vrijwilligers gezocht voor slotfeest',
   'Voor het slotfeest op 19 september zoeken we nog vier vrijwilligers voor de barbecue en de opbouw. Wie helpt mee?','approved'),
  ('00000000-0000-4000-8000-000000000312','00000000-0000-4000-8000-000000000306',
   '22222222-2222-4222-8222-222222222222','Kaatswant maat 8 te koop',
   'Nog in goede staat, twee seizoenen gebruikt. Interesse? Reageer hieronder.','approved');

insert into public.forum_replies (topic_id, author_id, body) values
  ('00000000-0000-4000-8000-000000000310','11111111-1111-4111-8111-111111111111',
   'Eens! En wat een opkomst langs de lijn. Op naar de volgende partij.'),
  ('00000000-0000-4000-8000-000000000311','22222222-2222-4222-8222-222222222222',
   'Ik help graag mee met de opbouw!');

-- ---------------------------------------------------------------- peiling
insert into public.polls (id, question, results_visible, status, created_by, ends_at) values
  ('00000000-0000-4000-8000-000000000320','Welke starttijd heeft jouw voorkeur voor ledenpartijen?',
   'after_vote','published','11111111-1111-4111-8111-111111111111', now() + interval '14 days');
insert into public.poll_options (poll_id, label, sort_order) values
  ('00000000-0000-4000-8000-000000000320','09:00 uur',1),
  ('00000000-0000-4000-8000-000000000320','10:00 uur',2),
  ('00000000-0000-4000-8000-000000000320','11:00 uur',3);
insert into public.poll_votes (poll_id, option_id, user_id)
select '00000000-0000-4000-8000-000000000320', o.id, '22222222-2222-4222-8222-222222222222'
from public.poll_options o
where o.poll_id = '00000000-0000-4000-8000-000000000320' and o.sort_order = 2;
