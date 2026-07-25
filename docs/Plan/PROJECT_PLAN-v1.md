---
title: Project plan — v1 (superseded)
project: kv-eendracht
status: superseded
tags: [plan, v1, historical, progress]
updated: 2026-07-25
---
# PROJECT_PLAN.md — KV Eendracht

> **Superseded.** The v1 phase log, kept as a record of what was built and decided.
> Current plan: [[PROJECT_PLAN]].

Voortgangsregistratie. Status: ✅ klaar · 🔄 bezig · ⬜ open · ⚠️ beperking

## Fase 0 — Analyse en ontwerp
- ✅ Functionele analyse (docs/ARCHITECTURE.md §1)
- ✅ Technisch architectuurplan (docs/ARCHITECTURE.md)
- ✅ Databaseontwerp + RLS-matrix (docs/DATABASE.md)
- ✅ Schermen en flows (docs/SCREENS.md)
- ✅ CLAUDE.md projectregels
- ✅ Gefaseerd bouwplan (dit bestand)

## Fase 1 — Basis
- ✅ Expo-project (SDK 54), TypeScript strict, Expo Router, ESLint, Jest, EAS
- ✅ Thema/design tokens (rood/wit/zwart/goud), Barlow Condensed + Inter,
     tabular numerals, logo-placeholder (`assets/images/kv-eendracht-logo.png`)
- ✅ Supabase-client (SecureStore-sessies, chunking) + env-validatie (Zod)
- ✅ Auth: e-mail (beheer), anoniem (schermnaam), rol-sync naar Zustand
- ✅ Migraties: 30 tabellen, indexes, triggers, views, RPC's
- ✅ RLS op alle tabellen + storage-policies (gedocumenteerd per tabel)
- ✅ Seed: 28 fictieve spelers, competitie + 3 avonden, 4 toernooien,
     agenda, nieuws, forum, peiling

## Fase 2 — Publieke app
- ✅ Home (hero, volgende activiteit/toernooi, top 5, nieuws, peiling, snelknoppen)
- ✅ Agenda: lijst + maandweergave, filters, zoeken, detail, delen
- ✅ Nieuwsoverzicht (Community-tab) + detail
- ✅ Toernooioverzicht + detail (parturen, hoofdronde, herkansing, realtime)
- ✅ Competitiestand (sporttabel, stijging/daling, realtime) + legenda
- ✅ Loading skeletons, empty states, error states, offline-banner overal

## Fase 3 — Spelers en competitie
- ✅ Deelnemersadministratie (zoeken, toevoegen, bewerken, archiveren,
     dubbeldetectie, contactvelden alleen beheer)
- ✅ Speelavondbeheer + partijenoverzicht
- ✅ Snelle uitslageninvoer (grote ±-knoppen, autosave-concept, bevestiging,
     idempotent via client_mutation_id)
- ✅ Automatische aanwezigheid (RPC) + afronden/heropenen + controlescherm
- ✅ Standings via `recalculate_standings` (RPC) + spelersdetail

## Fase 4 — Toernooibuilder
- ✅ Wizard: basis → vorm × categorie → deelnemers → loting → publiceren
- ✅ D.E.L.-partitie (kleinste even T; x=N−2T, y=3T−N) + seedbare loting
- ✅ D.E.L. ABC strikt (grootste even aantal, reserves met reden) + flexibele modus
- ✅ 2 tegen 2, Pearke (dame+heer, override met motivatie)
- ✅ Vrije Formatie (+Beperkt): validatielogica (dubbele spelers, niveaus,
     max parturen, gemengd) — UI-invoer via wizard is v1-beperkt (zie README)
- ✅ Knock-out: seeding, staand nummer, doorzetten, derde-plaats, herkansing
- ✅ Poules: KNKB-max 8 + club-override, snake-indeling, round-robin,
     7-puntentelling, tiebreaks configureerbaar
- ✅ Sneker telling: configuratie, 3 omlopen, herhalingsminimalisatie,
     individuele klassering (omloop 2/3 loot beheerder na afloop — v1)

## Fase 5 — Community
- ✅ Anonieme auth + schermnaam-flow
- ✅ Forum: categorieën, topics, reacties (1 niveau), likes, meldknop
- ✅ Moderatie: wachtrij (view), goedkeuren/afwijzen, pending-status anoniem,
     rate limits (DB-trigger), blokkades, feature-kill-switches
- ✅ Foto's: compressie 1600px/EXIF-strip, voortgang, moderatiewachtrij,
     storage-policies (eigen map, 5 MB, jpeg/png/webp)
- ✅ Peilingen: 1 stem p.p. (unique constraint + RLS), resultaatzichtbaarheid

## Fase 6 — Afronding
- ✅ Tests: Jest-suite (§29) + `scripts/verify-domain.ts` — **17/17 geslaagd**
     (incl. N=2..100, 10/17/18/23/25/27/35/37, ABC, Pearke, KNKB-punten,
     standen-sortering, automatische aan-/afwezigheid, heropenen)
- ✅ Toegankelijkheid: labels/rollen, ≥44 pt, contrast, tabular numerals
- ✅ Offline: query-persist (24 u), offline-banner, autosave-concepten,
     idempotente uitslagen
- ✅ Documentatie: README (setup, Expo Go, dev builds, EAS, stores), docs/
- ⚠️ In deze bouwomgeving was npm geblokkeerd: `npm install`, `tsc`, `eslint`,
     `jest` en `expo start` éénmalig lokaal draaien na het klonen (zie README
     "Bekende beperkingen"). RLS-gedragstests: policies gedocumenteerd,
     pgTAP-automatisering staat op de v2-lijst.

## Besluitenlog
- Navigatie: 5 tabs + profielknop → /meer (spec §4 staat dit toe).
- Loting client-side met opgeslagen seed (reproduceerbaar); standen en
  aanwezigheid server-side via SECURITY DEFINER-RPC's.
- Contentcategorieën als text+CHECK/settings i.p.v. DB-enums (spec §24).
- Idempotentie uitslagen via unieke `client_mutation_id` (spec §27).
- Kolomsplitsing spelers via `v_players_public` (contactgegevens nooit publiek).
- Expo SDK 54-versies; `npx expo install --fix` als vangnet (README).
- N=5 blijkt wél oplosbaar (1 drietal + 1 tweetal); onoplosbaar zijn 2, 3 en 7 —
  daarvoor toont de app een reservevoorstel.

## Related

- [[PROJECT_PLAN]]
- [[ARCHITECTURE-v1-supabase]]
- [[KV-EENDRACHT-APP-SPEC]]
