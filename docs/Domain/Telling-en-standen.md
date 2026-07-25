---
title: Scoring, standings and attendance
project: kv-eendracht
status: reference
tags: [domain, standings, scoring, attendance, knkb, sneker, rpc]
updated: 2026-07-25
---

# Scoring, standings and attendance

> Where [[Lotingsvormen]] covers forming parturen, this covers what happens once they play.
> The split matters: draws are **client-side and seeded**, standings are **server-side and
> recomputable**. See [[ARCHITECTURE]].

## Match scoring

A regular partij is won at **6 eersten**. `matchResultSchema` rejects non-integers, negatives,
values above 6, a winner with fewer eersten than the loser, 6–6, and draws unless explicitly
allowed. `autoWinner(red, white)` resolves the winner the moment a side reaches 6, so the score
entry screen can confirm without the volunteer choosing anything.

The same constraints exist independently in the database as `CHECK` constraints and inside
`apply_match_result`. That duplication is deliberate: the client copy gives instant feedback at
the side of the pitch, the database copy is the one that cannot be bypassed.

## KNKB poule scoring

- Winner takes **7 match points**; the loser scores **its own number of eersten**. A narrow
  5–6 loss is therefore worth far more than a 1–6 loss, which is what keeps outclassed
  parturen playing hard to the end.
- KNKB default maximum is 8 parturen per poule. Exceeding it requires a `clubOverride`
  **plus** a written motivation, which is surfaced in the messages.
- Tiebreak order, configurable, default: match points ↓ → fewest eersten tegen → head-to-head →
  optional saldo → partuur number as a stable final fallback.

## Sneker telling

An individual format: parturen are **re-drawn every round**, so ranking follows the player
rather than the team.

```ts
SNEKER_DEFAULT = {
  rounds: 3,
  winPoints: 7,
  loserPoints: 'eersten',
  tiebreak: ['tegeneersten'],
  rotateTeammates: true,
  rotateOpponents: true,
  maxRepeatPairings: 1,
}
```

`drawSnekerRounds` re-draws each round while minimising repeated team-mates, using a greedy
best-of-40 candidate search scored against previously seen pairings — deterministic per seed,
so it stays reproducible despite the search. `computeSnekerStanding` awards `winPoints` to
every player of the winning partuur and the partuur's own eersten to each losing player.

## Competition standings

```
saldo = eersten voor − eersten tegen
```

Default sort order for KV Eendracht, configurable per competition via
`competitions.standings_config`:

1. most **eersten voor** ↓
2. fewest **eersten tegen** ↑
3. highest **saldo** ↓
4. most **deelnames** ↓
5. alphabetical name ↑ (technical fallback, so the order is never ambiguous)

Note what leads: **eersten voor, not matches won.** The club ranks on eersten scored across the
season, which rewards turning up and scoring rather than only winning — consistent with
counting `deelnames` as a tiebreak.

`sortStandings` also computes `delta = previousPosition − position` for the rise/fall arrow.

> **Change both or neither.** The persistent table is produced by the `recalculate_standings`
> RPC; the TypeScript module is the testable mirror used for previews. Changing the sort order
> means changing the RPC, the view, the TypeScript module and the tests **in one commit** —
> see [[KV-EENDRACHT-APP-SPEC#17. Change recipes — "I want to change X"]]. Since
> [[ADR-0004-pnpm-monorepo]] the TypeScript half is shared by both applications, so at least
> the client and server can no longer disagree with each other.

## Automatic attendance

The workflow that runs every match night:

1. An admin creates a *speelavond* (`competition_rounds`).
2. Every active competition participant counts as **expected**.
3. Entering a result marks all players of both parturen `present`, with `source = 'auto'`.
4. **At most one attendance record per player per night**, even across several matches —
   `UNIQUE (round_id, player_id)` plus `ON CONFLICT DO NOTHING`. Manual records are never
   overwritten by automatic ones.
5. "Speelavond afronden" marks every expected player still without a record as `absent`.
6. The finalize preview first groups players into: aanwezig / nog niet verwerkt / handmatig
   afgemeld / geblesseerd / gastspeler — so nobody is marked absent by accident.
7. Reopening removes **only** auto-generated absences. Manual corrections survive, which is the
   whole point: a volunteer's deliberate entry outranks the automation.
8. Every correction is written to `audit_logs`, and standings are recalculated after each
   change.

## Related

- [[Lotingsvormen]] · [[Kaatsen-glossarium]] · [[DATABASE]] · [[ARCHITECTURE]]
- [[KV-EENDRACHT-APP-SPEC#10. Domain rules — draws, scoring, standings]]
