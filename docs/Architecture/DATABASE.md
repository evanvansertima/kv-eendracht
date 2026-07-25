# Databaseontwerp — KV Eendracht

Bron van waarheid: `supabase/migrations/*.sql`. Dit document beschrijft opzet,
relaties en het RLS-toegangsmodel.

## Ontwerpprincipes

- UUID-primary keys (`gen_random_uuid()`), overal `created_at`/`updated_at`
  (trigger `set_updated_at`).
- "Enums" als `text` + `CHECK`-constraint óf lookup-instelling in
  `app_settings`, zodat nieuwe categorieën zonder migratie mogelijk zijn waar
  dat functioneel nodig is (agenda-types, nieuwscategorieën). Echte
  Postgres-enums alleen voor stabiele technische statussen.
- Soft delete via `archived_at` voor spelers/teams/toernooien met historie;
  cascading delete alleen voor puur afhankelijke rijen (poll_options bij poll,
  team_members bij team).
- Indexes op alle veelgebruikte filters (datum, status, foreign keys).
- Auditlog (`audit_logs`) gevuld door triggers op uitslagen, aanwezigheid,
  standen en rollen.

## Tabellen en relaties

### Identiteit en rollen
| Tabel | Kern | Relaties |
|---|---|---|
| `profiles` | 1-op-1 met `auth.users`; `display_name`, `role` (guest/moderator/admin/super_admin), `is_anonymous`, `is_blocked` | id → auth.users |
| `blocked_users` | blokkades met reden/vervaldatum | user_id → profiles |

### Sportadministratie
| Tabel | Kern |
|---|---|
| `player_profiles` | centrale spelersadministratie; naamvelden, geboortedatum, leeftijdscategorie, gender-aanduiding, niveau A/B/C, vereniging, actief, contactgegevens (RLS: alleen beheer), foto, opmerkingen (beheer), `archived_at` |
| `seasons` | seizoenen |
| `competitions` | naam, seizoen, categorie, data, status, `standings_config` (jsonb sorteervolgorde), zichtbaarheid |
| `competition_players` | koppel speler↔competitie, actief |
| `competition_rounds` | speelavond/ronde; status open/afgerond; `finalized_at/by` |
| `attendance` | per ronde per speler: present/absent/excused/injured/guest; `source` auto/manual; **uniek (round_id, player_id)** |
| `tournaments` | naam, datum, locatie, `match_system` (knockout/knockout_consolation/poule/competitie/sneker), `formation_category` (vrije_formatie/del/del_abc/vrije_formatie_beperkt/twee_tegen_twee/pearke), partuurgrootte, perken, poule-config, herkansingsconfig, `sneker_config`, beperkingen (jsonb), status, `draw_seed`, `draw_published_at/by` |
| `tournament_registrations` | inschrijvingen + wachtlijst/reserve, status |
| `teams` | partuur binnen toernooi óf competitieronde; nummer, naam, aanvoerder, poule, `is_bye`, bracket-metadata |
| `team_members` | speler↔team; rol; vervangingshistorie (`replaced_by`, `replaced_at`) |
| `matches` | toernooi/ronde, bracketpositie (`round_no`, `match_no`, `bracket` main/consolation, `next_match_id`, `next_slot`), poule, perk, tijden, status (scheduled/live/finished/cancelled), team_red/team_white (laagste nummer = rood = opslag) |
| `match_results` | eersten rood/wit, spelpunten laatste eerst, winnaar, opmerkingen, `entered_by`, **uniek `client_mutation_id`**, wijzigingshistorie via audit |
| `standings` | gematerialiseerde competitiestand per speler: eersten voor/tegen, saldo, deelnames, afwezig, gespeeld/gewonnen/verloren, positie, vorige positie; **alleen via RPC beschreven** |

### Content en community
| Tabel | Kern |
|---|---|
| `agenda_events` | titel, omschrijving, type (vrij tekstveld + suggestielijst), start/eind, locatie, afbeelding, organisator, doelgroep, status, links naar toernooi/competitie, publicatiestatus |
| `news_posts` | titel, intro, body, hoofdfoto, auteur, categorie, uitgelicht, status concept/gepland/gepubliceerd, `published_at` (gepland = toekomstige datum), reacties aan/uit |
| `news_media` | extra afbeeldingen bij nieuws |
| `forum_categories` | naam, volgorde, actief |
| `forum_topics` | titel, inhoud, auteur (profile), categorie, foto, vastgezet, gesloten, moderatiestatus pending/approved/rejected/hidden |
| `forum_replies` | topic, parent (max 1 niveau; CHECK dat parent zelf geen parent heeft), inhoud, bewerkt-op, moderatiestatus |
| `reactions` | likes: **uniek (user_id, subject_type, subject_id)** |
| `polls` / `poll_options` / `poll_votes` | peiling; **uniek (poll_id, user_id)** tegen dubbel stemmen; resultaat zichtbaar direct/na stemmen |
| `media_uploads` | foto-inzendingen; storage-pad, moderatiestatus, afwijzingsreden (beheer) |
| `reports` | rapportages van content, status open/afgehandeld |
| `app_settings` | key/value (jsonb): communityfeatures aan/uit, rate limits, poulebeslisregels-default, Sneker-config-default, KNKB-maximum |
| `audit_logs` | actor, actie, tabel, record, oude/nieuwe waarden (jsonb) |
| `rate_limit_events` | per gebruiker per actietype; gebruikt door `check_rate_limit()` |

## Views en functies (RPC)

- `v_competition_standings` — actuele stand met sortering volgens config.
- `v_player_stats` — spelersstatistieken over rondes.
- `v_poule_standings` — poulestand (7-puntenregel, tegeneersten, saldo).
- `v_moderation_queue` — alles met status pending voor moderators.
- `recalculate_standings(competition_id)` — SECURITY DEFINER; herbouwt de
  volledige stand uit uitslagen + aanwezigheid; bewaart vorige posities.
- `finalize_round(round_id)` — markeert niet-verwerkte verwachte deelnemers
  afwezig, sluit de ronde, herberekent, logt in audit.
- `reopen_round(round_id)` — heropent + verwijdert auto-afwezigheid.
- `apply_match_result(...)` — idempotente uitslagverwerking: schrijft uitslag,
  zet winnaar door in bracket, markeert aanwezigheid (max 1 per speler per
  ronde), alles in één transactie.
- `is_admin()`, `is_moderator()`, `current_role()` — SECURITY DEFINER-helpers
  voor RLS zonder recursie.
- `check_rate_limit(action, max, window)` — trigger-helper voor communityposts.

## RLS-matrix (samenvatting; volledige policies in `20260716000003_rls.sql`)

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | eigen rij + beheer; publiek alleen `display_name` via view | via trigger bij signup | eigen `display_name`; rol alleen super_admin/admin | — |
| player_profiles | publiek: alleen niet-gearchiveerd en zonder contactvelden (kolomsplitsing via view `v_players_public`); beheer: alles | beheer | beheer | — (archiveren) |
| competitions/rounds/standings | publiek indien `visibility='public'` en gepubliceerd; beheer alles | beheer | beheer (standings alleen via RPC) | beheer |
| attendance | publiek: geaggregeerd via view; beheer: alles | via RPC/beheer | beheer | beheer |
| tournaments/teams/matches/results | publiek indien gepubliceerd; concepten alleen beheer | beheer | beheer/moderator-met-wedstrijdrecht | beheer |
| agenda_events / news_posts | publiek indien gepubliceerd (en `published_at <= now()`) | beheer | beheer | beheer |
| forum_topics/replies | approved voor iedereen; eigen pending voor auteur; alles voor moderator | ingelogd (ook anoniem), mits niet geblokkeerd + rate limit + community aan | auteur binnen bewerktijd; moderator | auteur (soft), moderator |
| reactions | iedereen | ingelogd, alleen `user_id = auth.uid()` | — | eigen rij |
| polls/options | gepubliceerd voor iedereen | beheer | beheer | beheer |
| poll_votes | eigen stem; totalen via view | ingelogd, 1× per poll (constraint + policy) | — | — |
| media_uploads | approved publiek; eigen rijen; beheer alles | ingelogd + rate limit | moderator (status) | beheer |
| reports | melder ziet eigen; moderator alles | ingelogd | moderator | — |
| app_settings | iedereen leest publieke keys | — | admin | — |
| audit_logs | admin | via triggers | — | — |

Storage: bucket `media` — lezen publiek voor goedgekeurde paden, schrijven
alleen eigen map `auth.uid()/…` met bestandstype-/groottecheck; bucket
`news` — lezen publiek, schrijven beheer.
