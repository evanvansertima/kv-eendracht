/**
 * D.E.L. ABC — spec §14.
 * Strikte modus (standaard): elk partuur exact 1×A, 1×B, 1×C.
 * Grootste EVEN aantal complete parturen; rest zichtbaar op reservelijst
 * met exacte reden. Flexibele modus is instelbaar maar staat standaard uit.
 */

import { createRng, shuffle } from '../random.ts';
import type { DrawPlayer, DrawResult, DrawTeam, ReserveEntry } from './types.ts';

export interface AbcOptions {
  /** true (default): nooit twee spelers van hetzelfde niveau in één partuur. */
  strict?: boolean;
  /** Even aantal parturen vereist (default true). */
  requireEvenTeams?: boolean;
}

export function drawDelAbc(
  players: readonly DrawPlayer[],
  seed: number,
  options: AbcOptions = {},
): DrawResult {
  const { strict = true, requireEvenTeams = true } = options;
  const rng = createRng(seed);
  const messages: string[] = [];

  const groupA = shuffle(players.filter((p) => p.skillLevel === 'A'), rng);
  const groupB = shuffle(players.filter((p) => p.skillLevel === 'B'), rng);
  const groupC = shuffle(players.filter((p) => p.skillLevel === 'C'), rng);
  const unknown = players.filter((p) => !p.skillLevel);

  if (unknown.length > 0) {
    return {
      ok: false,
      teams: [],
      reserves: unknown.map((player) => ({ player, reason: 'Geen niveau (A/B/C) ingesteld' })),
      messages: [
        `Bij ${unknown.length} speler(s) is geen niveau ingesteld. Stel eerst voor iedere deelnemer A, B of C in.`,
      ],
      seed,
    };
  }

  // aantal complete ABC-parturen
  let complete = Math.min(groupA.length, groupB.length, groupC.length);
  if (requireEvenTeams && complete % 2 !== 0) {
    complete -= 1; // grootste even aantal
  }

  if (complete <= 0) {
    return {
      ok: false,
      teams: [],
      reserves: players.map((player) => ({
        player,
        reason: `Niveau ${player.skillLevel}: geen compleet ABC-partuur mogelijk`,
      })),
      messages: [
        buildShortageMessage(groupA.length, groupB.length, groupC.length, requireEvenTeams),
      ],
      seed,
    };
  }

  const teams: DrawTeam[] = [];
  for (let i = 0; i < complete; i++) {
    teams.push({
      teamNo: i + 1,
      players: [groupA[i], groupB[i], groupC[i]],
    });
  }

  // reservelijst met exacte reden
  const reserves: ReserveEntry[] = [];
  const leftovers: Array<[DrawPlayer[], 'A' | 'B' | 'C']> = [
    [groupA.slice(complete), 'A'],
    [groupB.slice(complete), 'B'],
    [groupC.slice(complete), 'C'],
  ];
  const min = Math.min(groupA.length, groupB.length, groupC.length);
  for (const [left, level] of leftovers) {
    for (const player of left) {
      let reason: string;
      if (left.length > 0 && groupCount(level, groupA, groupB, groupC) > min) {
        const excess = groupCount(level, groupA, groupB, groupC) - min;
        reason = `${excess} ${level}-speler${excess === 1 ? '' : 's'} te veel ten opzichte van het kleinste niveau`;
      } else {
        reason = 'Oneven aantal complete parturen; grootste even aantal gebruikt';
      }
      reserves.push({ player, reason });
    }
  }

  if (reserves.length > 0) {
    messages.push(buildShortageMessage(groupA.length, groupB.length, groupC.length, requireEvenTeams));
  }
  messages.push(`${complete} complete ABC-parturen geloot (A: ${groupA.length}, B: ${groupB.length}, C: ${groupC.length}).`);
  if (!strict) {
    messages.push('Let op: flexibele modus staat aan; handmatige aanpassingen buiten de ABC-balans zijn toegestaan.');
  }

  return { ok: true, teams, reserves, messages, seed };
}

function groupCount(level: 'A' | 'B' | 'C', a: DrawPlayer[], b: DrawPlayer[], c: DrawPlayer[]): number {
  return level === 'A' ? a.length : level === 'B' ? b.length : c.length;
}

function buildShortageMessage(a: number, b: number, c: number, requireEven: boolean): string {
  const min = Math.min(a, b, c);
  const parts: string[] = [];
  if (a > min) parts.push(`${a - min} A-speler${a - min === 1 ? '' : 's'} te veel`);
  if (b > min) parts.push(`${b - min} B-speler${b - min === 1 ? '' : 's'} te veel`);
  if (c > min) parts.push(`${c - min} C-speler${c - min === 1 ? '' : 's'} te veel`);
  if (min === 0) {
    const missing = [a === 0 ? 'A' : null, b === 0 ? 'B' : null, c === 0 ? 'C' : null].filter(Boolean);
    parts.push(`geen ${missing.join('- en ')}-spelers beschikbaar`);
  }
  if (requireEven && min % 2 !== 0 && min > 0) {
    parts.push('oneven aantal complete parturen; grootste even aantal gebruikt');
  }
  return parts.length > 0 ? `Reservelijst: ${parts.join('; ')}.` : 'Alle spelers ingedeeld.';
}

/**
 * Valideert een (handmatig aangepast) partuur in strikte ABC-modus.
 * Geeft een Nederlandstalige waarschuwing terug of null als het klopt.
 */
export function validateAbcTeam(team: DrawTeam): string | null {
  const levels = team.players.map((p) => p.skillLevel).sort();
  if (team.players.length !== 3) {
    return `Partuur ${team.teamNo} heeft ${team.players.length} spelers; een ABC-partuur heeft er exact 3.`;
  }
  if (levels[0] !== 'A' || levels[1] !== 'B' || levels[2] !== 'C') {
    return `Partuur ${team.teamNo} verbreekt de ABC-balans (niveaus: ${team.players
      .map((p) => p.skillLevel ?? '?')
      .join(', ')}). Een strikt ABC-partuur bevat exact één A-, één B- en één C-speler.`;
  }
  return null;
}
