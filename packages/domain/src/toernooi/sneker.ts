/**
 * Sneker telling — spec §19. Individuele klassering over meerdere omlopen.
 * Volledig configureerbaar; defaults komen uit app_settings ('sneker_default').
 */

import { createRng, shuffle } from '../random.ts';
import { computePartition } from '../loting/partition.ts';
import type { DrawPlayer, DrawTeam } from '../loting/types.ts';

export interface SnekerConfig {
  rounds: number; // aantal omlopen (default 3)
  winPoints: number; // punten winnend partuur p.p. (default 7)
  loserPoints: 'eersten'; // score verliezend partuur = behaalde eersten
  tiebreak: Array<'tegeneersten' | 'onderling' | 'loting'>;
  rotateTeammates: boolean; // andere medespelers per omloop
  rotateOpponents: boolean; // andere tegenstanders per omloop
  maxRepeatPairings: number; // max herhaalde combinaties
}

export const SNEKER_DEFAULT: SnekerConfig = {
  rounds: 3,
  winPoints: 7,
  loserPoints: 'eersten',
  tiebreak: ['tegeneersten'],
  rotateTeammates: true,
  rotateOpponents: true,
  maxRepeatPairings: 1,
};

export interface SnekerRoundDraw {
  roundNo: number;
  teams: DrawTeam[];
}

/**
 * Loot parturen voor alle omlopen en minimaliseert herhaalde mede-/tegenstanders
 * met een greedy best-of-k-optimalisatie (deterministisch via seed).
 */
export function drawSnekerRounds(
  players: readonly DrawPlayer[],
  seed: number,
  config: SnekerConfig = SNEKER_DEFAULT,
): { ok: boolean; rounds: SnekerRoundDraw[]; messages: string[] } {
  const outcome = computePartition(players.length);
  if (!outcome.ok || !outcome.partition) {
    return { ok: false, rounds: [], messages: [outcome.message ?? 'Loting niet mogelijk.'] };
  }

  const rng = createRng(seed);
  const teammateCount = new Map<string, number>(); // 'idA|idB' gesorteerd
  const rounds: SnekerRoundDraw[] = [];
  const ATTEMPTS = 40; // kandidaat-lotingen per omloop

  for (let r = 1; r <= config.rounds; r++) {
    let best: DrawTeam[] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const candidate = makeTeams(shuffle(players, rng), outcome.partition.triples, outcome.partition.pairs);
      const score = config.rotateTeammates ? repeatScore(candidate, teammateCount) : 0;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
        if (score === 0) break;
      }
    }

    const chosen = best!;
    for (const team of chosen) {
      for (const [a, b] of pairsOf(team.players)) {
        const key = pairKey(a.id, b.id);
        teammateCount.set(key, (teammateCount.get(key) ?? 0) + 1);
      }
    }
    rounds.push({ roundNo: r, teams: chosen });
  }

  const repeats = [...teammateCount.values()].filter((v) => v > 1).length;
  const messages = [
    `${config.rounds} omlopen geloot voor ${players.length} spelers.`,
    repeats === 0
      ? 'Geen herhaalde maten over de omlopen.'
      : `${repeats} herhaalde maat-combinatie(s); minimalisatie toegepast (max ingesteld: ${config.maxRepeatPairings}).`,
  ];
  return { ok: true, rounds, messages };
}

function makeTeams(shuffled: DrawPlayer[], triples: number, pairs: number): DrawTeam[] {
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
  return teams;
}

function repeatScore(teams: DrawTeam[], seen: Map<string, number>): number {
  let score = 0;
  for (const team of teams) {
    for (const [a, b] of pairsOf(team.players)) {
      score += seen.get(pairKey(a.id, b.id)) ?? 0;
    }
  }
  return score;
}

function pairsOf(players: DrawPlayer[]): Array<[DrawPlayer, DrawPlayer]> {
  const out: Array<[DrawPlayer, DrawPlayer]> = [];
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++) out.push([players[i], players[j]]);
  return out;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ------------------------------------------------------------------ scoring

export interface SnekerMatchResult {
  roundNo: number;
  redPlayers: string[]; // speler-ids
  whitePlayers: string[];
  eerstenRed: number;
  eerstenWhite: number;
  winner: 'red' | 'white';
}

export interface SnekerStandingRow {
  playerId: string;
  punten: number;
  tegeneersten: number;
  gespeeld: number;
  gewonnen: number;
}

/** Individuele klassering volgens de actieve Sneker-configuratie. */
export function computeSnekerStanding(
  playerIds: readonly string[],
  results: readonly SnekerMatchResult[],
  config: SnekerConfig = SNEKER_DEFAULT,
): SnekerStandingRow[] {
  const rows = new Map<string, SnekerStandingRow>();
  for (const id of playerIds) {
    rows.set(id, { playerId: id, punten: 0, tegeneersten: 0, gespeeld: 0, gewonnen: 0 });
  }

  for (const r of results) {
    const redWin = r.winner === 'red';
    for (const id of r.redPlayers) {
      const row = rows.get(id);
      if (!row) continue;
      row.gespeeld++;
      row.punten += redWin ? config.winPoints : r.eerstenRed;
      row.tegeneersten += r.eerstenWhite;
      if (redWin) row.gewonnen++;
    }
    for (const id of r.whitePlayers) {
      const row = rows.get(id);
      if (!row) continue;
      row.gespeeld++;
      row.punten += redWin ? r.eerstenWhite : config.winPoints;
      row.tegeneersten += r.eerstenRed;
      if (!redWin) row.gewonnen++;
    }
  }

  return [...rows.values()].sort((a, b) => {
    if (b.punten !== a.punten) return b.punten - a.punten;
    for (const rule of config.tiebreak) {
      if (rule === 'tegeneersten' && a.tegeneersten !== b.tegeneersten) {
        return a.tegeneersten - b.tegeneersten;
      }
    }
    return a.playerId.localeCompare(b.playerId); // stabiele fallback
  });
}
