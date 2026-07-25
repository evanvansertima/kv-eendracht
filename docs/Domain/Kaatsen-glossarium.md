---
title: Kaatsen glossary
project: kv-eendracht
status: reference
tags: [domain, kaatsen, glossary, frisian, terminology]
updated: 2026-07-25
---

# Kaatsen glossary

> *Kaatsen* is Frisian handball, the traditional sport of Friesland and the sport KV Eendracht
> plays. Frisian and Dutch terms are kept **untranslated** throughout the codebase — a
> *partuur* is not a "team" to anyone at the club, and renaming it would make the code harder
> to discuss with the people who use it. See rule 12 of [[CLAUDE]].

## Core terms

| Term | Meaning | In the code |
|---|---|---|
| **kaatsen** | Frisian handball | the sport |
| **partuur** (pl. *parturen*) | A team, normally 2 or 3 players | table `teams` |
| **eerst** (pl. *eersten*) | The scoring unit; first to 6 wins a match | `eersten_red` / `eersten_white` |
| **eersten voor / tegen** | Scored / conceded | standings columns V and T |
| **saldo** | `eersten voor − eersten tegen` | column S |
| **omloop** | A round of a knockout tournament | `matches.round_no` |
| **opslag** | The serve | lowest-numbered partuur serves first → red side, `OPSLAG` badge |
| **perk** | The playing field / court | `matches.court` |
| **staand nummer** | A bye — a partuur advancing without playing | `teams.is_bye` |
| **herkansing** | Repêchage for first-round losers | `bracket = 'consolation'` |
| **speelavond** | A club competition match night | `competition_rounds` |
| **deelnames** | Number of match nights attended | column D |
| **ledenpartij** | Members-only tournament | agenda type |
| **zachte bal** | The soft-ball variant | forum category |
| **KNKB** | Koninklijke Nederlandse Kaatsbond, the national federation whose rules are the defaults | — |

## Draw formats

Each has its own module in `packages/domain/loting/` — see [[Lotingsvormen]].

| Term | Meaning |
|---|---|
| **D.E.L.** | *Door Elkaar Loten* — individuals drawn at random into parturen |
| **D.E.L. ABC** | Random draw with exactly one A, one B and one C level player per partuur |
| **Vrije Formatie** | Pre-formed parturen entered by the club |
| **Vrije Formatie Beperkt** | Free formation with entry restrictions |
| **Pearke** | A pair of one *dame* and one *heer* |
| **Sneker telling** | Individual scoring across multiple re-drawn rounds |

## Two rules worth stating plainly

**A match is won at 6 eersten.** `MAX_EERSTEN = 6`, enforced both in the Zod schema in
`packages/domain/toernooi/matchResult.ts` and by `CHECK` constraints in the database. A 6–6
result is impossible and rejected in both places.

**The partuur with the lowest match number serves first**, is drawn on the red side, and
carries the `OPSLAG` badge. This is not a display preference — it is the sport's rule, and it
is why `orderByTeamNo` exists in the bracket generator.

## Related

- [[Lotingsvormen]] — the six formation categories in detail
- [[Telling-en-standen]] — scoring and standings
- [[KV-EENDRACHT-APP-SPEC#16. Glossary of Frisian handball (kaatsen) terms]]
