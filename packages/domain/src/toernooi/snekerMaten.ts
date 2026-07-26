/**
 * Snekertelling met verschillende maten.
 *
 * The club's variant, and the one their wedstrijdvorm is literally named after. Two
 * constraints run at once across three speelrondes:
 *
 * 1. **Different maten within a partuur.** Two A-spelers may never be drawn together,
 *    nor two B's, nor two C's. Every partuur is therefore one A, one B and one C.
 * 2. **A different combination each speelronde.** Nobody should play alongside the same
 *    partner twice if it can be avoided.
 *
 * This is a separate function rather than a flag on drawSnekerRounds. The existing
 * function knows nothing about niveau and is covered by its own tests; bolting a mode
 * onto it would make one function mean two things and put those tests at risk. The
 * constraint is also the whole point here, so it belongs in the name.
 *
 * Deterministic: the same seed always produces the same three speelrondes.
 */

import { createRng, shuffle } from '../random.ts';
import type { DrawPlayer, DrawTeam, ReserveEntry, SkillLevel } from '../loting/types.ts';

export interface SnekerMatenRound {
  roundNo: number;
  teams: DrawTeam[];
}

export interface SnekerMatenResult {
  ok: boolean;
  rounds: SnekerMatenRound[];
  /** Players left out every speelronde, with a Dutch reason. */
  reserves: ReserveEntry[];
  messages: string[];
  seed: number;
}

const LEVELS: SkillLevel[] = ['A', 'B', 'C'];

/** Sorted pair key, so A|B and B|A count as the same pairing. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** How many partner pairings in this draw have been seen before. */
function repeatScore(teams: DrawTeam[], seen: Map<string, number>): number {
  let score = 0;
  for (const team of teams) {
    for (let i = 0; i < team.players.length; i++) {
      for (let j = i + 1; j < team.players.length; j++) {
        score += seen.get(pairKey(team.players[i]!.id, team.players[j]!.id)) ?? 0;
      }
    }
  }
  return score;
}

function recordPairings(teams: DrawTeam[], seen: Map<string, number>): void {
  for (const team of teams) {
    for (let i = 0; i < team.players.length; i++) {
      for (let j = i + 1; j < team.players.length; j++) {
        const key = pairKey(team.players[i]!.id, team.players[j]!.id);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }
}

/**
 * Builds one speelronde by rotating the B and C lists against a fixed A list.
 *
 * A[i] plays with B[(i+ob) mod n] and C[(i+oc) mod n] for a chosen pair of offsets.
 */
function rotate(
  lists: { a: DrawPlayer[]; b: DrawPlayer[]; c: DrawPlayer[] },
  complete: number,
  ob: number,
  oc: number,
): DrawTeam[] {
  const teams: DrawTeam[] = [];
  for (let i = 0; i < complete; i++) {
    teams.push({
      teamNo: i + 1,
      players: [lists.a[i]!, lists.b[(i + ob) % complete]!, lists.c[(i + oc) % complete]!],
    });
  }
  return teams;
}

/**
 * Chooses the offsets for one speelronde: the first pair that repeats nothing.
 *
 * The offset space is only n x n, so this searches it exhaustively and therefore cannot
 * miss a valid rotation the way sampling can.
 *
 * The obvious closed form — B offset r, C offset 2r — is wrong for an even number of
 * parturen. With n = 4 the C offsets run 0, 2, 4 ≡ 0, so omlopen 1 and 3 reuse every
 * single A-C pairing. That shipped and was caught only by counting repeats in the
 * database against a real 4-partuur draw; the unit tests happened to use 6 per niveau,
 * where 2r stays distinct. Hence the exhaustive search, and hence the n-sweep test.
 */
function bestOffsets(
  lists: { a: DrawPlayer[]; b: DrawPlayer[]; c: DrawPlayer[] },
  complete: number,
  seen: Map<string, number>,
): { ob: number; oc: number; score: number } {
  let best = { ob: 0, oc: 0, score: Number.POSITIVE_INFINITY };

  for (let ob = 0; ob < complete; ob++) {
    for (let oc = 0; oc < complete; oc++) {
      const score = repeatScore(rotate(lists, complete, ob, oc), seen);
      if (score < best.score) {
        best = { ob, oc, score };
        if (score === 0) return best;
      }
    }
  }

  return best;
}

/**
 * Draws every speelronde of a Snekertelling met verschillende maten.
 *
 * Guarantees a different combination every speelronde whenever there are at least as
 * many parturen as omlopen. Below that the rotation wraps and repetition is reported
 * rather than hidden.
 */
export function drawSnekerMaten(
  players: readonly DrawPlayer[],
  seed: number,
  options: { rounds?: number } = {},
): SnekerMatenResult {
  const rounds = options.rounds ?? 3;
  const messages: string[] = [];

  const byLevel: Record<SkillLevel, DrawPlayer[]> = { A: [], B: [], C: [] };
  const noLevel: DrawPlayer[] = [];
  for (const p of players) {
    if (p.skillLevel && LEVELS.includes(p.skillLevel)) byLevel[p.skillLevel].push(p);
    else noLevel.push(p);
  }

  const complete = Math.min(byLevel.A.length, byLevel.B.length, byLevel.C.length);

  if (complete === 0) {
    const missing = LEVELS.filter((l) => byLevel[l].length === 0);
    return {
      ok: false,
      rounds: [],
      reserves: [],
      messages: [
        `Geen compleet partuur mogelijk: geen ${missing.join('- en ')}-spelers beschikbaar.`,
      ],
      seed,
    };
  }

  // The seed only decides the starting order within each niveau; the rotation after
  // that is fixed. So a seed still gives a different draw, but never a worse one.
  const rng = createRng(seed);
  const lists = {
    a: shuffle(byLevel.A, rng).slice(0, complete),
    b: shuffle(byLevel.B, rng).slice(0, complete),
    c: shuffle(byLevel.C, rng).slice(0, complete),
  };

  const seen = new Map<string, number>();
  const drawn: SnekerMatenRound[] = [];

  for (let r = 0; r < rounds; r++) {
    const { ob, oc, score } = bestOffsets(lists, complete, seen);
    const teams = rotate(lists, complete, ob, oc);
    recordPairings(teams, seen);
    drawn.push({ roundNo: r + 1, teams });

    // Only reachable when there are fewer parturen than omlopen, where the rotation
    // wraps onto itself and repetition is genuinely unavoidable.
    if (score > 0) {
      messages.push(
        `Omloop ${r + 1}: ${score} herhaalde combinatie${score === 1 ? '' : 's'} — ` +
          `met ${complete} partu${complete === 1 ? 'ur' : 'ren'} is een volledig nieuwe ` +
          'indeling niet mogelijk.',
      );
    }
  }

  // Anyone the level balance could not seat, with the reason spelled out. Silently
  // dropping a player is exactly the thing that causes arguments in a kantine.
  const reserves: ReserveEntry[] = [];
  for (const level of LEVELS) {
    const surplus = byLevel[level].slice(complete);
    for (const player of surplus) {
      reserves.push({
        player,
        reason: `${surplus.length} ${level}-speler${surplus.length === 1 ? '' : 's'} te veel ten opzichte van het kleinste niveau`,
      });
    }
  }
  for (const player of noLevel) {
    reserves.push({
      player,
      reason: 'geen niveau ingesteld, kan niet in een partuur met verschillende maten',
    });
  }

  messages.unshift(
    `${complete} parturen per omloop (1 A, 1 B en 1 C per partuur), ${drawn.length} omlopen.`,
  );

  return { ok: drawn.length === rounds, rounds: drawn, reserves, messages, seed };
}

/**
 * Checks the constraint directly, for a draw an admin has edited by hand.
 *
 * Returns a Dutch warning per offending partuur, or an empty array when every partuur
 * has three different maten.
 */
export function validateVerschillendeMaten(teams: readonly DrawTeam[]): string[] {
  const problems: string[] = [];

  for (const team of teams) {
    const counts = new Map<string, number>();
    for (const p of team.players) {
      const level = p.skillLevel ?? 'onbekend';
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    for (const [level, n] of counts) {
      if (n > 1) {
        problems.push(
          level === 'onbekend'
            ? `Partuur ${team.teamNo}: ${n} spelers zonder niveau.`
            : `Partuur ${team.teamNo}: ${n} ${level}-maten samen; dat mag niet bij Snekertelling.`,
        );
      }
    }
  }

  return problems;
}
