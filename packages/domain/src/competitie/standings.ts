/**
 * Competitiestand — spec §21.
 * Sortering (KV Eendracht-default, centraal configureerbaar):
 * 1. meeste eersten voor  2. minste eersten tegen  3. hoogste saldo
 * 4. meeste deelnames     5. alfabetische naam (technische fallback)
 *
 * De persistente stand wordt in de database berekend (RPC
 * recalculate_standings); deze module bevat de identieke, unit-testbare regels
 * en wordt gebruikt voor previews en client-side controles.
 */

export interface StandingInput {
  playerId: string;
  displayName: string;
  eerstenVoor: number;
  eerstenTegen: number;
  deelnames: number;
  afwezig: number;
  gespeeld: number;
  gewonnen: number;
  verloren: number;
}

export interface StandingRow extends StandingInput {
  saldo: number;
  position: number;
  previousPosition?: number;
  /** stijging (+), daling (−) of 0 t.o.v. vorige speelavond */
  delta?: number;
}

export type SortRule =
  | 'eersten_voor_desc'
  | 'eersten_tegen_asc'
  | 'saldo_desc'
  | 'deelnames_desc'
  | 'naam_asc';

export const DEFAULT_SORT_ORDER: SortRule[] = [
  'eersten_voor_desc',
  'eersten_tegen_asc',
  'saldo_desc',
  'deelnames_desc',
  'naam_asc',
];

export function computeSaldo(eerstenVoor: number, eerstenTegen: number): number {
  return eerstenVoor - eerstenTegen;
}

export function sortStandings(
  input: readonly StandingInput[],
  order: SortRule[] = DEFAULT_SORT_ORDER,
  previousPositions: Record<string, number> = {},
): StandingRow[] {
  const rows = input.map((r) => ({
    ...r,
    saldo: computeSaldo(r.eerstenVoor, r.eerstenTegen),
    position: 0,
    previousPosition: previousPositions[r.playerId],
    delta: undefined as number | undefined,
  }));

  rows.sort((a, b) => {
    for (const rule of order) {
      switch (rule) {
        case 'eersten_voor_desc':
          if (b.eerstenVoor !== a.eerstenVoor) return b.eerstenVoor - a.eerstenVoor;
          break;
        case 'eersten_tegen_asc':
          if (a.eerstenTegen !== b.eerstenTegen) return a.eerstenTegen - b.eerstenTegen;
          break;
        case 'saldo_desc':
          if (b.saldo !== a.saldo) return b.saldo - a.saldo;
          break;
        case 'deelnames_desc':
          if (b.deelnames !== a.deelnames) return b.deelnames - a.deelnames;
          break;
        case 'naam_asc': {
          const cmp = a.displayName.localeCompare(b.displayName, 'nl');
          if (cmp !== 0) return cmp;
          break;
        }
      }
    }
    return 0;
  });

  rows.forEach((row, i) => {
    row.position = i + 1;
    row.delta = row.previousPosition !== undefined ? row.previousPosition - row.position : undefined;
  });
  return rows;
}

/**
 * Aggregatie van uitslagen naar spelersstatistieken (spiegel van de
 * database-berekening, voor tests en previews).
 */
export interface PlayerMatchLine {
  playerId: string;
  eerstenVoor: number;
  eerstenTegen: number;
  won: boolean;
}

export function aggregateMatchLines(
  lines: readonly PlayerMatchLine[],
): Map<string, { eerstenVoor: number; eerstenTegen: number; gespeeld: number; gewonnen: number; verloren: number }> {
  const out = new Map<string, { eerstenVoor: number; eerstenTegen: number; gespeeld: number; gewonnen: number; verloren: number }>();
  for (const line of lines) {
    const agg = out.get(line.playerId) ?? { eerstenVoor: 0, eerstenTegen: 0, gespeeld: 0, gewonnen: 0, verloren: 0 };
    agg.eerstenVoor += line.eerstenVoor;
    agg.eerstenTegen += line.eerstenTegen;
    agg.gespeeld += 1;
    if (line.won) agg.gewonnen += 1;
    else agg.verloren += 1;
    out.set(line.playerId, agg);
  }
  return out;
}
