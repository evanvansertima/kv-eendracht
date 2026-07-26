/**
 * Ranking-based draw: parturen built from players of similar competition standing.
 *
 * The club's rule, worked through with A..F ranked first to sixth:
 *
 *   Partuur 1: A, C, E
 *   Partuur 2: B, D, F
 *
 * So within each block of players the ranks alternate between the two parturen. The
 * effect is two sides of near-equal strength — 1+3+5 against 2+4+6 — rather than the
 * top three against the bottom three, which would be a walkover.
 *
 * The same principle repeats for each following block, so the whole field is split
 * into balanced pairings between players of comparable rank rather than across it.
 */

import type { DrawPlayer, DrawResult, DrawTeam, ReserveEntry } from './types.ts';

export interface RankedPlayer extends DrawPlayer {
  /** Position in the competitiestand. Lower is better; unranked sorts last. */
  ranking?: number | null;
}

/**
 * Draws parturen of `teamSize` by alternating ranked players into two parturen per
 * block, then moving to the next block.
 *
 * Players without a ranking are placed after those with one, keeping their relative
 * order, so a new member is never silently promoted into the strongest partuur.
 */
export function drawByRanking(
  players: readonly RankedPlayer[],
  teamSize: 2 | 3 = 3,
): DrawResult {
  const messages: string[] = [];

  // Unranked players sort last but are still drawn; ties break on name so the result
  // is deterministic without needing the rng.
  const ordered = [...players].sort((a, b) => {
    const ra = a.ranking ?? Number.MAX_SAFE_INTEGER;
    const rb = b.ranking ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.displayName.localeCompare(b.displayName, 'nl');
  });

  const unranked = ordered.filter((p) => p.ranking == null).length;
  if (unranked > 0) {
    messages.push(
      `${unranked} speler${unranked === 1 ? '' : 's'} zonder competitiestand; ` +
        'die word' + (unranked === 1 ? 't' : 'en') + ' onderaan ingedeeld.',
    );
  }

  // Each block fills two parturen, so a block is 2 × teamSize players.
  const blockSize = teamSize * 2;
  const usable = Math.floor(ordered.length / blockSize) * blockSize;

  const teams: DrawTeam[] = [];
  const reserves: ReserveEntry[] = [];
  let teamNo = 0;

  for (let start = 0; start < usable; start += blockSize) {
    const block = ordered.slice(start, start + blockSize);
    const first: DrawPlayer[] = [];
    const second: DrawPlayer[] = [];
    // Alternate: ranks 1,3,5 to one partuur and 2,4,6 to the other.
    block.forEach((p, i) => (i % 2 === 0 ? first : second).push(stripRanking(p)));
    teams.push({ teamNo: ++teamNo, players: first });
    teams.push({ teamNo: ++teamNo, players: second });
  }

  for (const p of ordered.slice(usable)) {
    reserves.push({
      player: stripRanking(p),
      reason: `Onvoldoende spelers voor een volledig blok van ${blockSize}`,
    });
  }

  if (teams.length === 0) {
    return {
      ok: false,
      teams: [],
      reserves,
      messages: [
        `Er zijn minimaal ${blockSize} spelers nodig om op ranking te loten ` +
          `(nu ${players.length}).`,
      ],
      seed: 0,
    };
  }

  messages.unshift(
    `${usable} spelers verdeeld over ${teams.length} parturen op basis van de competitiestand.`,
  );

  // seed 0: this draw is deterministic from the standings, not from randomness. It is
  // reproducible by construction, so there is no seed to store.
  return { ok: true, teams, reserves, messages, seed: 0 };
}

function stripRanking(p: RankedPlayer): DrawPlayer {
  const { id, displayName, skillLevel, gender } = p;
  return { id, displayName, skillLevel, gender };
}
