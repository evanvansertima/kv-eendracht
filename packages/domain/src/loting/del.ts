/**
 * Door Elkaar Loten (D.E.L.) — spec §13.
 * Alle spelers, zoveel mogelijk drietallen, even aantal parturen,
 * Fisher-Yates met seed (reproduceerbaar).
 */

import { createRng, shuffle } from '../random.ts';
import { computePartition } from './partition.ts';
import type { DrawPlayer, DrawResult, DrawTeam } from './types.ts';

export function drawDel(players: readonly DrawPlayer[], seed: number): DrawResult {
  const outcome = computePartition(players.length);
  if (!outcome.ok || !outcome.partition) {
    return { ok: false, teams: [], reserves: [], messages: [outcome.message ?? 'Loting niet mogelijk.'], seed };
  }

  const rng = createRng(seed);
  const shuffled = shuffle(players, rng);
  const { triples, pairs } = outcome.partition;

  const teams: DrawTeam[] = [];
  let idx = 0;
  for (let i = 0; i < triples; i++) {
    teams.push({ teamNo: teams.length + 1, players: shuffled.slice(idx, idx + 3) });
    idx += 3;
  }
  for (let i = 0; i < pairs; i++) {
    teams.push({ teamNo: teams.length + 1, players: shuffled.slice(idx, idx + 2) });
    idx += 2;
  }

  return {
    ok: true,
    teams,
    reserves: [],
    messages: [
      `${players.length} spelers verdeeld over ${teams.length} parturen (${triples} drietallen, ${pairs} tweetallen).`,
    ],
    seed,
  };
}
