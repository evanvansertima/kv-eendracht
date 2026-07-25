---
title: Draw formats (loting) and team partitioning
project: kv-eendracht
status: reference
tags: [domain, loting, draw, partition, deterministic, seed]
updated: 2026-07-25
---

# Draw formats and team partitioning

> All logic here is pure TypeScript in `packages/domain/loting/`, deterministic through
> `createRng(seed)`. The published seed is stored in `tournaments.draw_seed`, which is what
> makes any historical draw reproducible — a club member can ask "how did I end up in that
> partuur in May?" and get an exact answer.

## Two independent axes

Match system and formation category are independent; any sensible combination is allowed.

| `match_system` | Meaning |
|---|---|
| `knockout` | Straight elimination |
| `knockout_consolation` | Elimination plus *herkansing* for first-round losers |
| `poule` | One or more round-robin groups |
| `competition` | League format |
| `sneker` | Sneker telling — individual ranking across re-drawn rounds, see [[Telling-en-standen]] |

| `formation_category` | Composition |
|---|---|
| `vrije_formatie` | Pre-formed parturen entered by the admin |
| `del` | Door Elkaar Loten — random draw across all participants |
| `del_abc` | Exactly one A, one B and one C player per partuur |
| `vrije_formatie_beperkt` | Free formation with restrictions |
| `twee_tegen_twee` | Parturen of exactly two |
| `pearke` | One *dame* + one *heer*, overridable with motivation |

## The partition problem

Kaatsen parturen hold 2 or 3 players, and a knockout draw needs an **even** number of them.
For `N` players, find the smallest even `T` with:

```
ceil(N / 3) ≤ T ≤ floor(N / 2)
```

then

```
triples  x = N − 2T
pairs    y = 3T − N
```

Invariants asserted by the test suite: `x ≥ 0`, `y ≥ 0`, `x + y = T`, `3x + 2y = N`, and `T`
even. This uses every player and maximises three-player parturen under the even constraint.

| N | T | triples | pairs |
|---|---|---|---|
| 10 | 4 | 2 | 2 |
| 17 | 6 | 5 | 1 |
| 18 | 6 | 6 | 0 |
| 23 | 8 | 7 | 1 |
| 25 | 10 | 5 | 5 |
| 27 | 10 | 7 | 3 |
| 35 | 12 | 11 | 1 |
| 37 | 14 | 9 | 5 |

**Only 2, 3 and 7 are unsolvable.** Note that 5 *is* solvable — one triple plus one pair — a
case that looks unsolvable at a glance and is pinned by a regression test. For the three
genuinely impossible counts, `computePartitionWithSuggestion` proposes a reserve player rather
than silently dropping anyone; the interface must show the reason and let the admin decide.

The verification script sweeps N = 2…100 on every run.

## Per-format notes

**D.E.L.** — Fisher–Yates shuffle with the seeded RNG, then fill `x` triples followed by `y`
pairs. Every player appears exactly once; the same seed always reproduces the draw.

**D.E.L. ABC** — split into A, B and C groups and shuffle each separately;
`complete = min(|A|,|B|,|C|)`, rounded down to even when an even count is required; partuur *i*
is `A[i] + B[i] + C[i]`. Strict mode never allows two players of the same level. Leftover
players go to the reserve list **with an explicit Dutch reason** ("2 A-spelers te veel", "geen
C-spelers beschikbaar"), because "you are not playing" without a reason is the kind of thing
that causes arguments in a clubhouse. A flexible mode exists but is off by default.

**2 tegen 2** — parturen of exactly two and an even number of them, so usable players =
`floor(N/4) * 4`; the remainder becomes reserves with a reason.

**Pearke** — one *dame* + one *heer*; `pairs = min(|dames|, |heren|)`. The interface shows how
many pearkes are possible and what is missing ("2 heren te kort"). Setting
`mixedRequired: false` demands an `overrideReason` of at least 5 characters, which is echoed
into the messages for the audit trail.

**Vrije Formatie** — `validateVrijeFormatie` returns Dutch errors for wrong partuur size,
duplicate players within a partuur, **the same player in two parturen of one tournament**, a
captain not in their own partuur, level and age-category violations, gender rule breaches, and
exceeding `maxTeams`.

## Knockout structure

- Bracket size is the next power of two; `byes = size − N` (*staand nummer*), distributed by
  standard seed order so seeds 1 and 2 land in opposite halves.
- **Lowest match number is always the red side and serves first** — see
  [[Kaatsen-glossarium]].
- Byes are pre-advanced into round 2 at generation time.
- `advanceWinner` is immutable and simultaneously routes the loser to the *herkansing* when
  configured.
- `findDoubleActivePlayers` prevents a player being live in the main draw and the herkansing at
  the same moment — a real scheduling hazard when both brackets run on adjacent perken.

## Guardrails

Two lint-enforced rules, from [[KV-EENDRACHT-APP-SPEC#12. Conventions and guardrails]]:

1. `packages/domain/**` may not import React, React Native, Expo or any backend client.
2. **No `Math.random()`.** Randomness comes only from `createRng`, or draws stop being
   reproducible and the stored seed becomes a lie.

## Related

- [[Telling-en-standen]] — what happens once the draw is played
- [[Kaatsen-glossarium]] · [[ADR-0004-pnpm-monorepo]]
- [[KV-EENDRACHT-APP-SPEC#10. Domain rules — draws, scoring, standings]]
