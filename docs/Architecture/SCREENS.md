---
title: Screens and user flows
project: kv-eendracht
status: current
tags: [screens, routes, navigation, flows, ux]
updated: 2026-07-25
---
# Schermen en gebruikersstromen — KV Eendracht

> Route map and flows. Still accurate; [[ADR-0002-react-native-on-all-platforms]] adds a
> web target to these same routes, with desktop layouts above the tablet breakpoint.

## Navigatiestructuur

5 bottom-tabs + profielknop in de header (→ /meer). Zes primaire onderdelen
passen niet comfortabel op kleine schermen; Login/Beheer zit daarom achter de
profielknop, zoals toegestaan in de specificatie.

```
(tabs)
├── Home            /
├── Agenda          /agenda            → /agenda/[id]
├── Toernooien      /toernooien        → /toernooi/[id] (info | loting | schema/bracket | uitslagen | stand)
├── Competitie      /competitie        → /competitie/[id] → /competitie/speler/[playerId]
└── Community       /community (Nieuws | Forum | Foto's | Peilingen)
                    → /nieuws/[id], /forum/topic/[id], /forum/nieuw

Profielknop (header, elke tab) → /meer
├── /login                      (beheerderslogin)
├── /meer/schermnaam            (anonieme deelname: schermnaam kiezen)
├── /meer/huisregels, /meer/privacy
└── /admin (alleen beheer)
    ├── dashboard               /admin
    ├── spelers                 /admin/spelers → /admin/spelers/[id]
    ├── agenda-beheer           /admin/agenda/nieuw|[id]
    ├── nieuws-beheer           /admin/nieuws/nieuw|[id]
    ├── competities             /admin/competitie/[id]
    │   ├── speelavond          /admin/speelavond/[id]  (uitslagen + afronden)
    │   └── uitslag invoeren    /admin/uitslag/[matchId] (grote +/- knoppen)
    ├── toernooibuilder         /admin/toernooi/nieuw (wizard) | /admin/toernooi/[id]
    │   └── loting              /admin/toernooi/[id]/loting (preview, herloten, schuiven, publiceren)
    ├── moderatie               /admin/moderatie (wachtrij, rapportages, blokkades)
    └── peilingen               /admin/peilingen
```

## Kernflows

**Publiek bekijken** — geen login; alle tabs bruikbaar; concepten onzichtbaar.

**Anoniem meedoen** — Community → actie (reageren/stemmen/foto) → als geen
sessie: schermnaam-sheet → `signInAnonymously()` + profiel met display_name →
actie uitvoeren. Nieuwe content van anonieme accounts start `pending`.

**Beheerder: speelavond** — /admin → speelavond openen → partijen aanmaken
(loting of handmatig) → per partij /admin/uitslag/[matchId]: grote rode/witte
zijde, +/- eersten (0–6), bevestigingsdialoog → RPC `apply_match_result`
(idempotent, markeert aanwezigheid) → na alle partijen "Speelavond afronden"
→ controlescherm (aanwezig / nog niet verwerkt / afgemeld / geblesseerd /
gast) → `finalize_round` → stand herberekend, Realtime-update bij kijkers.

**Beheerder: toernooi** — wizard: 1) basis (naam/datum/locatie/perken) →
2) wedstrijdvorm + formatiecategorie → 3) deelnemers selecteren →
4) loting (verdeling-preview, herloten met nieuwe seed, handmatig schuiven,
ABC-waarschuwingen, reservelijst met reden) → 5) bevestigen & publiceren
(seed opgeslagen) → schema/bracket gegenereerd → live uitslagen invoeren →
winnaars automatisch doorgezet; verliezers 1e omloop → herkansing (indien aan).

**Moderatie** — melding in dashboard-badge → wachtrij → goedkeuren/afwijzen
(reden) / gebruiker blokkeren / functie uitschakelen via app_settings.

## Statusconventies per scherm

Elk data-scherm heeft: skeleton (laden) → inhoud | EmptyState (icoon + NL-tekst
+ actie) | ErrorState (opnieuw proberen) + offline-banner met "laatst
bijgewerkt". Statuslabels: LIVE / BINNENKORT / AFGELOPEN / CONCEPT / VOL.

## Related

- [[ARCHITECTURE]]
- [[ADR-0002-react-native-on-all-platforms]]
- [[Lotingsvormen]]
- [[Telling-en-standen]]
- [[KV-EENDRACHT-APP-SPEC#6. Screen map and user flows]]
