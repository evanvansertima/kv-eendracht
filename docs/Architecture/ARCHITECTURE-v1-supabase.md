---
title: Architecture — v1 (Supabase, superseded)
project: kv-eendracht
status: superseded
tags: [architecture, supabase, v1, historical]
updated: 2026-07-25
---
# Technisch architectuurplan — KV Eendracht

> **Superseded.** This describes the v1 Supabase Cloud architecture, kept for context.
> Current architecture: [[ARCHITECTURE]]. Why it changed:
> [[ADR-0001-own-api-instead-of-supabase]].

## 1. Functionele analyse (samenvatting)

Drie toegangsniveaus: publieke bezoeker (lezen), anonieme communitygebruiker
(Supabase Anonymous Auth + schermnaam; forum/reacties/likes/stemmen/foto's/
rapporteren, met misbruikbescherming) en beheerder (e-mail + wachtwoord;
rollen `guest` < `moderator` < `admin` < `super_admin`).

Functionele kernen:

1. **Contentplatform**: agenda, nieuws, peilingen, foto's, forum (moderatie).
2. **Sportadministratie**: centrale spelersadministratie, toernooibuilder
   (5 wedstrijdvormen × 6 formatiecategorieën), uitslagen, competities met
   automatische aanwezigheid en herberekenbare standen.
3. **Beheeromgeving**: mobiel dashboard, snelle uitslageninvoer langs het veld,
   auditlog.

Hoogste prioriteiten: betrouwbare lotings-/wedstrijdlogica, correcte stand,
automatische aanwezigheid, veilige rechten (RLS), veldvriendelijke bediening,
sportuitstraling, onderhoudbaarheid.

## 2. Systeemarchitectuur

```
┌────────────────────────── Mobiele app (Expo / React Native) ─────────────────────────┐
│ app/ (Expo Router)                                                                    │
│   └─ schermen = dunne compositie                                                      │
│ src/features/* ── TanStack Query hooks (server state, cache, realtime-invalidatie)    │
│ src/domain/*  ── pure logica: loting, brackets, poules, Sneker, standen (client-side  │
│                  preview; database is bron van waarheid voor persistente standen)     │
│ src/lib/supabase.ts ── één client, SecureStore-sessie, anon key                       │
│ src/stores/*  ── Zustand: UI-state (schermnaam, filters, online-status)               │
└───────────────────────────────────────────────────────────────────────────────────────┘
                    │ PostgREST / Realtime / Storage / Auth (HTTPS)
┌───────────────────────────────── Supabase ────────────────────────────────────────────┐
│ Postgres: 30+ tabellen, RLS op alles, SECURITY DEFINER RPC's voor standen/afronden    │
│ Auth: email+wachtwoord (beheer), anonymous sign-in (community)                        │
│ Storage: buckets media (publiek na moderatie), avatars (beheer)                       │
│ Realtime: matches, match_results, standings → live uitslagen                          │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### Waarom deze verdeling

- **Loting in de client, uitslag in de database.** Een loting is een
  interactief proces (herloten, handmatig schuiven, preview) — dat hoort in de
  app, deterministisch via seed die bij publicatie wordt opgeslagen zodat elke
  loting reproduceerbaar is. Standen en aanwezigheid zijn boekhouding — die
  berekent Postgres (RPC), zodat geen enkele client een inconsistente stand kan
  schrijven en herberekening altijd volledig is.
- **RLS als enige autorisatielaag.** De app gebruikt uitsluitend de anon key;
  elke query loopt door policies. Rollen staan in `profiles.role` en worden
  gelezen via `SECURITY DEFINER`-helpers (`is_admin()`, `is_moderator()`) om
  recursieve policies te vermijden.
- **Idempotentie.** `match_results.client_mutation_id` is uniek; een retry na
  een wegvallende verbinding kan nooit een dubbele uitslag opleveren.

## 3. Server state, caching en offline

- TanStack Query met `staleTime` per domein (agenda/nieuws 5 min, standen 1 min,
  live wedstrijden 10 s + Realtime-invalidatie).
- Persistente cache (AsyncStorage-persister) zodat agenda, nieuws, standen en
  toernooien offline zichtbaar blijven met "laatst bijgewerkt"-tijdstempel.
- `onlineManager` gekoppeld aan NetInfo → offline-banner; mutaties gebufferd
  (`networkMode: 'online'`), uitslag-concepten lokaal opgeslagen (autosave).
- Optimistic updates alleen voor likes en stemmen (veilig, idempotent);
  uitslagen altijd bevestigend, nooit optimistisch.

## 4. Beveiliging en misbruikpreventie

- Anonieme gebruikers: rate limits in de database (`check_rate_limit()`-trigger:
  max. n berichten per tijdvak per gebruiker), moderatiestatus `pending` voor
  nieuwe topics/foto's van anonieme accounts, rapportagefunctie, bloklijst
  (`blocked_users`, gecontroleerd in RLS), app-brede kill switch per
  communityfunctie via `app_settings`.
- CAPTCHA: Supabase Auth attack protection (Turnstile) aanzetten in het
  dashboard; gedocumenteerd in README (kan niet in migraties).
- Upload: client comprimeert (max 1600 px, jpeg), EXIF gestript, max 5 MB,
  alleen jpeg/png/webp; Storage-policies dwingen pad `user_id/*` af.
- Login-bruteforce: Supabase Auth-throttling + nette Nederlandse foutmeldingen.

## 5. Navigatie

Vijf bottom-tabs (Home, Agenda, Toernooien, Competitie, Community) + Profiel-
knop in de header van elke tab → `/meer` (login, profiel, beheer, instellingen,
huisregels, privacy). Na inloggen als beheerder toont `/meer` het beheer-menu
en verschijnt het dashboard op `/admin`. Alle publieke routes werken zonder
sessie. Deeplink-schema: `kveendracht://`.

## 6. Gefaseerd bouwplan

| Fase | Inhoud | Kwaliteitspoort |
|---|---|---|
| 1 | Projectbasis, thema, fonts, Supabase-client, auth, migraties, RLS | typecheck, lint, verify, start |
| 2 | Publieke schermen: Home, Agenda, Nieuws, Toernooien, Stand | + empty/error/loading states |
| 3 | Spelers, competitiebeheer, speelavonden, uitslagen, aanwezigheid | + standentests |
| 4 | Toernooibuilder: alle vormen, brackets, herkansing, poules, Sneker | + lotingstests 2–100 |
| 5 | Community: forum, reacties, foto's, peilingen, moderatie, anon auth | + RLS-tests |
| 6 | Afronding: a11y, performance, offline, EAS, documentatie | volledige suite |

Latere uitbreidbaarheid is ingebouwd voor: kalenderkoppeling (agenda-items
hebben al alle velden voor ICS/Google), pushnotificaties (expo-notifications),
CSV-import (aparte edge function).

## Related

- [[ARCHITECTURE]]
- [[ADR-0001-own-api-instead-of-supabase]]
- [[PROJECT_PLAN-v1]]
