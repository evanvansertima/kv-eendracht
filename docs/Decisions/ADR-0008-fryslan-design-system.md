---
title: ADR-0008 — The Fryslân design system
project: kv-eendracht
status: accepted
date: 2026-07-25
amends: KV-EENDRACHT-APP-SPEC section 1 (visual identity)
tags: [adr, design, colour, typography, accessibility, tokens]
updated: 2026-07-25
---

# ADR-0008 — The Fryslân design system

## Status

Accepted, 2026-07-25. Replaces the visual identity in
[[KV-EENDRACHT-APP-SPEC#1. Project at a glance]].

## Context

The v1 spec described an ESPN-inspired identity: club red `#B3121F` with ochre `#E8A926`,
large condensed **italic** headings, dark sport surfaces, and accent bars skewed −8°.

Two facts made this worth revisiting rather than simply implementing.

**It was never actually built.** The token file carried its own note — *"TODO na aanlevering
logo: kleuren afstemmen op het officiële KV Eendracht-logo"* — so the red and gold were
placeholder guesses awaiting a logo that never arrived. There was no established identity to
preserve. Worse, no fonts were ever loaded at all: `expo-font` was not a dependency, so every
screen rendered in system faces and the specified typography existed only on paper.

**The reference had aged.** Heavy condensed italics and skewed accent bars are the
sports-broadcast idiom of roughly 2015. They still read as "sport", but they also read as
dated, and italics lose legibility badly at the sizes a phone forces.

## Decision

### Colour — deep Frisian blue, red demoted to a signal

Kaatsen is *the* Frisian sport and the Frisian flag is blue and white, so blue is the most
place-rooted choice available. It is also, in a field where club sports apps default to
red-and-black, the most distinctive one.

Red survives **only as a semantic signal**: live, absent, conceded, negative saldo. It is no
longer a brand colour. This is better information design — red should mean something rather
than decorate — and it means a `LIVE` chip now genuinely stands out instead of competing with
red chrome around it.

| Role | Value |
|---|---|
| `sport` / `ink` | `#0E1E33` · `#081221` — dark scoreboard surfaces |
| `primary` | `#1C5FD8`, `#589BFF` on dark |
| `accent` | `#F0A11B` — upcoming, highlights |
| `gain` / `loss` | `#22A06B` · `#E5484D` — semantic only |
| `background` / `card` | `#F6F8FB` · `#FFFFFF` |

Dark surfaces are blue-tinted rather than grey. That is what stadium scoreboards use, and it
keeps numerals reading as bright rather than washed out.

### Typography — condensed, but upright

Barlow Condensed for headings, Inter for everything else, now genuinely loaded via
`expo-font` with the splash held until they are ready so nothing renders in a fallback face
and reflows.

Condensed still earns its place: Dutch compounds like *Competitiestand* and
*Herkansingspartij* are long, and condensed fits them without wrapping. But **upright
ExtraBold replaces Black Italic**, for legibility at small sizes.

Tabular numerals on every figure in standings and results is retained and non-negotiable —
with proportional digits, columns shift width per row and comparison gets measurably harder.

### Structure — quiet chrome, loud data

The core principle, and the main departure from the original. Navigation, headers and section
labels are deliberately understated; sport data sits on dark panels where the numbers are the
brightest thing on screen. Section labels became small spaced uppercase rather than large
italic headings.

On the standings table, only **eersten voor** is set bold — it leads the sort order defined in
[[Telling-en-standen]], so it is the single number a reader should land on first.

### Semantic tokens

Tokens are semantic pairs (`sport` / `onSport`, `card` / `text`, `accentSoft` /
`onAccentSoft`) rather than raw hex. A dark theme is therefore a second palette object rather
than an edit to every screen — `darkPalette` already exists and is unused, waiting on a theme
provider.

## Consequences

**Good**

- Distinctive and rooted in place rather than generic.
- Better contrast outdoors, which matters: kaatsen is played outside, and a spectator
  checking a live score is holding a phone in Frisian daylight.
- Red now carries meaning.
- Dark mode is cheap to add later.

**Bad**

- Diverges from the written spec, so [[KV-EENDRACHT-APP-SPEC]] section 1 is now stale and
  must be updated to match.
- If the real club colours turn out to be red — plausible for a Dutch sports club — this needs
  revisiting. Mitigated by everything routing through `lightPalette`, so a change is one file.

**Still open**

The club logo. The palette was designed independently rather than sampled from it, so the
colours remain provisional in exactly the way the v1 TODO described. The app icon and
adaptive icon remain placeholders and stay a store-submission blocker, logged in
[[PROJECT_PLAN]] phase 6.

## Accessibility

- Rise/fall indicators pair an arrow **and** a number with the colour, so red/green is never
  the sole carrier of meaning.
- All touch targets remain ≥ 44 pt; score entry keeps the 88 pt targets from the v1 spec,
  which correctly recognised that screen is used one-handed at the side of a pitch.

## Related

- [[ADR-0002-react-native-on-all-platforms]] — one codebase, so this system covers all three
  platforms at once
- [[Telling-en-standen]] · [[CLAUDE]]
