/**
 * Pearke — spec §18. Standaard: partuur van één dame + één heer.
 * Instelbaar met gemotiveerde override voor lokale/inclusieve varianten.
 */

import { createRng, shuffle } from '../random.ts';
import type { DrawPlayer, DrawResult, DrawTeam, ReserveEntry } from './types.ts';

export interface PearkeOptions {
  /** true (default): pearke = dame + heer. false: vrije samenstelling van 2. */
  mixedRequired?: boolean;
  /** Verplichte motivatie wanneer mixedRequired op false staat. */
  overrideReason?: string;
}

export function drawPearke(
  players: readonly DrawPlayer[],
  seed: number,
  options: PearkeOptions = {},
): DrawResult {
  const { mixedRequired = true, overrideReason } = options;
  const rng = createRng(seed);
  const messages: string[] = [];

  if (!mixedRequired) {
    if (!overrideReason || overrideReason.trim().length < 5) {
      return {
        ok: false,
        teams: [],
        reserves: [],
        messages: ['Een afwijking van de dame/heer-regel vereist een motivatie van de beheerder.'],
        seed,
      };
    }
    messages.push(`Afwijkende samenstelling toegestaan. Motivatie: ${overrideReason.trim()}`);
    const shuffled = shuffle(players, rng);
    const teamsCount = Math.floor(players.length / 2);
    const teams: DrawTeam[] = [];
    for (let i = 0; i < teamsCount; i++) {
      teams.push({ teamNo: i + 1, players: shuffled.slice(i * 2, i * 2 + 2) });
    }
    const reserves: ReserveEntry[] = shuffled.slice(teamsCount * 2).map((player) => ({
      player,
      reason: 'Oneven aantal spelers',
    }));
    messages.push(`${teams.length} pearkes gevormd (vrije samenstelling).`);
    return { ok: true, teams, reserves, messages, seed };
  }

  const dames = shuffle(players.filter((p) => p.gender === 'dame'), rng);
  const heren = shuffle(players.filter((p) => p.gender === 'heer'), rng);
  const other = players.filter((p) => p.gender !== 'dame' && p.gender !== 'heer');

  const pairs = Math.min(dames.length, heren.length);
  const teams: DrawTeam[] = [];
  for (let i = 0; i < pairs; i++) {
    teams.push({ teamNo: i + 1, players: [dames[i], heren[i]] });
  }

  const reserves: ReserveEntry[] = [
    ...dames.slice(pairs).map((player) => ({ player, reason: 'Geen heer beschikbaar als maat' })),
    ...heren.slice(pairs).map((player) => ({ player, reason: 'Geen dame beschikbaar als maat' })),
    ...other.map((player) => ({
      player,
      reason: 'Geen dame/heer-aanduiding; stel deze in of gebruik de override',
    })),
  ];

  messages.push(
    `${pairs} pearke${pairs === 1 ? '' : 's'} mogelijk (${dames.length} dames, ${heren.length} heren).`,
  );
  if (dames.length !== heren.length) {
    const diff = Math.abs(dames.length - heren.length);
    messages.push(
      `Ontbrekende combinaties: ${diff} ${dames.length > heren.length ? 'heer' : 'dame'}${diff === 1 ? '' : diff > 1 && dames.length > heren.length ? 'en' : 's'} te kort.`,
    );
  }

  return { ok: pairs > 0, teams, reserves, messages, seed };
}
