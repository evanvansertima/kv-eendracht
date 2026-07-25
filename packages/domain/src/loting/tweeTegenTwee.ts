/**
 * 2 tegen 2 — spec §17. Parturen van exact 2, even aantal parturen,
 * overige spelers op de reservelijst, zelfde eerlijke seedbare loting.
 */

import { createRng, shuffle } from '../random.ts';
import type { DrawPlayer, DrawResult, DrawTeam, ReserveEntry } from './types.ts';

export function drawTweeTegenTwee(players: readonly DrawPlayer[], seed: number): DrawResult {
  const rng = createRng(seed);
  const shuffled = shuffle(players, rng);

  // even aantal parturen van 2 → aantal spelers moet veelvoud van 4 zijn
  const usable = Math.floor(players.length / 4) * 4;
  const teamsCount = usable / 2;

  if (teamsCount < 2) {
    return {
      ok: false,
      teams: [],
      reserves: shuffled.map((player) => ({ player, reason: 'Minimaal 4 spelers nodig voor 2 tegen 2' })),
      messages: [`Met ${players.length} spelers kan geen 2-tegen-2-wedstrijd worden gevormd (minimaal 4 nodig).`],
      seed,
    };
  }

  const teams: DrawTeam[] = [];
  for (let i = 0; i < teamsCount; i++) {
    teams.push({ teamNo: i + 1, players: shuffled.slice(i * 2, i * 2 + 2) });
  }
  const reserves: ReserveEntry[] = shuffled.slice(usable).map((player) => ({
    player,
    reason: 'Overtallig: alleen een even aantal parturen van 2 is toegestaan',
  }));

  return {
    ok: true,
    teams,
    reserves,
    messages: [
      `${usable} spelers verdeeld over ${teamsCount} parturen van 2.` +
        (reserves.length > 0 ? ` ${reserves.length} speler(s) op de reservelijst.` : ''),
    ],
    seed,
  };
}
