/**
 * Poulesysteem — spec §12.
 * Indeling, round-robin-schema en KNKB-poulestand:
 * winst 7 punten, verliezer = behaalde eersten; tiebreak minste tegeneersten →
 * onderling resultaat → configureerbaar.
 */

import { createRng, shuffle } from '../random.ts';
import type { DrawTeam } from '../loting/types.ts';

export interface PouleConfig {
  /** aantal poules (1 of meer) */
  pouleCount: number;
  /** KNKB-maximum per toernooi (default 8); clubinstelling kan afwijken */
  maxTeams?: number;
  clubOverride?: boolean;
  overrideReason?: string;
  /** finale tussen poulewinnaars */
  crossFinals?: boolean;
  /** wedstrijd om plek 3 tussen de nummers 2 */
  thirdPlaceMatch?: boolean;
  tiebreak?: TiebreakRule[];
}

export type TiebreakRule = 'tegeneersten' | 'onderling' | 'saldo' | 'loting';

export interface PouleAssignment {
  ok: boolean;
  poules: DrawTeam[][];
  messages: string[];
}

export function assignPoules(
  teams: readonly DrawTeam[],
  config: PouleConfig,
  seed: number,
): PouleAssignment {
  const messages: string[] = [];
  const max = config.maxTeams ?? 8;

  if (teams.length > max && !config.clubOverride) {
    return {
      ok: false,
      poules: [],
      messages: [
        `KNKB-instelling: maximaal ${max} parturen (nu ${teams.length}). Gebruik de clubinstelling met motivatie om af te wijken.`,
      ],
    };
  }
  if (config.clubOverride) {
    if (!config.overrideReason || config.overrideReason.trim().length < 5) {
      return { ok: false, poules: [], messages: ['Afwijken van het KNKB-maximum vereist een motivatie.'] };
    }
    messages.push(`Clubafwijking actief: ${config.overrideReason.trim()}`);
  }
  if (config.pouleCount < 1 || teams.length / config.pouleCount < 2) {
    return { ok: false, poules: [], messages: ['Elke poule heeft minimaal 2 parturen nodig.'] };
  }

  // evenwichtige indeling: shuffle en rond verdelen (snake)
  const rng = createRng(seed);
  const shuffled = shuffle(teams, rng);
  const poules: DrawTeam[][] = Array.from({ length: config.pouleCount }, () => []);
  shuffled.forEach((team, i) => {
    const round = Math.floor(i / config.pouleCount);
    const idx = round % 2 === 0 ? i % config.pouleCount : config.pouleCount - 1 - (i % config.pouleCount);
    poules[idx].push(team);
  });

  const sizes = poules.map((p) => p.length).join(', ');
  messages.push(`${teams.length} parturen verdeeld over ${config.pouleCount} poule(s) (${sizes}).`);
  return { ok: true, poules, messages };
}

export interface PouleMatchPlan {
  pouleNo: number;
  roundNo: number;
  matchNo: number;
  redTeamNo: number; // laagste nummer = opslag
  whiteTeamNo: number;
}

/** Round-robin (circle method) per poule; iedereen speelt iedereen. */
export function generatePouleSchedule(poules: readonly DrawTeam[][]): PouleMatchPlan[] {
  const plan: PouleMatchPlan[] = [];
  poules.forEach((poule, pIdx) => {
    const nos = poule.map((t) => t.teamNo);
    const list: (number | null)[] = nos.length % 2 === 0 ? [...nos] : [...nos, null];
    const n = list.length;
    let matchNo = 1;
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i];
        const b = list[n - 1 - i];
        if (a === null || b === null) continue;
        plan.push({
          pouleNo: pIdx + 1,
          roundNo: round + 1,
          matchNo: matchNo++,
          redTeamNo: Math.min(a, b),
          whiteTeamNo: Math.max(a, b),
        });
      }
      // roteer (eerste blijft staan)
      list.splice(1, 0, list.pop()!);
    }
  });
  return plan;
}

export interface PouleMatchResult {
  redTeamNo: number;
  whiteTeamNo: number;
  eerstenRed: number;
  eerstenWhite: number;
  winner: 'red' | 'white';
}

export interface PouleStandingRow {
  teamNo: number;
  gespeeld: number;
  gewonnen: number;
  verloren: number;
  punten: number; // wedstrijdpunten (KNKB)
  eerstenVoor: number;
  eerstenTegen: number;
  saldo: number;
}

export function computePouleStanding(
  teamNos: readonly number[],
  results: readonly PouleMatchResult[],
  tiebreak: TiebreakRule[] = ['tegeneersten', 'onderling'],
): PouleStandingRow[] {
  const rows = new Map<number, PouleStandingRow>();
  for (const no of teamNos) {
    rows.set(no, {
      teamNo: no, gespeeld: 0, gewonnen: 0, verloren: 0,
      punten: 0, eerstenVoor: 0, eerstenTegen: 0, saldo: 0,
    });
  }

  for (const r of results) {
    const red = rows.get(r.redTeamNo);
    const white = rows.get(r.whiteTeamNo);
    if (!red || !white) continue;
    red.gespeeld++; white.gespeeld++;
    red.eerstenVoor += r.eerstenRed; red.eerstenTegen += r.eerstenWhite;
    white.eerstenVoor += r.eerstenWhite; white.eerstenTegen += r.eerstenRed;
    if (r.winner === 'red') {
      red.gewonnen++; white.verloren++;
      red.punten += 7; white.punten += r.eerstenWhite; // KNKB
    } else {
      white.gewonnen++; red.verloren++;
      white.punten += 7; red.punten += r.eerstenRed;
    }
  }
  for (const row of rows.values()) row.saldo = row.eerstenVoor - row.eerstenTegen;

  const headToHead = (a: number, b: number): number => {
    for (const r of results) {
      if (r.redTeamNo === a && r.whiteTeamNo === b) return r.winner === 'red' ? -1 : 1;
      if (r.redTeamNo === b && r.whiteTeamNo === a) return r.winner === 'white' ? -1 : 1;
    }
    return 0;
  };

  return [...rows.values()].sort((a, b) => {
    if (b.punten !== a.punten) return b.punten - a.punten;
    for (const rule of tiebreak) {
      switch (rule) {
        case 'tegeneersten':
          if (a.eerstenTegen !== b.eerstenTegen) return a.eerstenTegen - b.eerstenTegen;
          break;
        case 'onderling': {
          const h = headToHead(a.teamNo, b.teamNo);
          if (h !== 0) return h;
          break;
        }
        case 'saldo':
          if (b.saldo !== a.saldo) return b.saldo - a.saldo;
          break;
        case 'loting':
          break; // beslist door beheerder buiten deze functie
      }
    }
    return a.teamNo - b.teamNo; // stabiele technische fallback
  });
}
