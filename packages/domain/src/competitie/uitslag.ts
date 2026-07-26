/**
 * How a kaats score is written down.
 *
 * A partij is won at 6 eersten, but the winning eerst is never displayed as "6". The
 * club writes the eersten as they stood *before* the deciding eerst, followed by the
 * punten within it:
 *
 *   eersten 6-5, laatste eerst 6-2   ->   "5-5, 6-2"
 *
 * So the winner's 6 becomes 5 for display, because that sixth eerst is the one the
 * punten describe. Reading "6-5, 6-2" would double-count it.
 */

import { MAX_EERSTEN } from '../toernooi/matchResult.ts';

// Re-exported so callers in this folder can take the winning-score constant from the
// module they already depend on. Importing it without re-exporting silently left it
// undefined for those callers, which made every `>= MAX_EERSTEN` comparison false.
export { MAX_EERSTEN };

/** Punten within one eerst: 0, 2, 4, 6 — then the eerst is won. */
export const PUNTEN_LADDER = [0, 2, 4, 6] as const;

/**
 * Punten shown for the winning point when both parturen stand at 5 eersten and 6
 * punten — the "alles aan de hang" situation.
 *
 * At 6-6 punten the next point decides the whole partij, and the club writes it as 8
 * rather than as another 6 so the deciding point is unmistakable in the logbook.
 */
export const ALLES_AAN_DE_HANG_PUNTEN = 8;

export interface Uitslag {
  eerstenRed: number;
  eerstenWhite: number;
  /** Punten in the deciding eerst, e.g. [6, 2]. */
  puntenLaatsteEerst?: readonly [number, number] | null;
}

/** True when both sides stand at five eersten and six punten: the next point wins. */
export function isAllesAanDeHang(
  eerstenRed: number,
  eerstenWhite: number,
  puntenRed: number,
  puntenWhite: number,
): boolean {
  return (
    eerstenRed === MAX_EERSTEN - 1 &&
    eerstenWhite === MAX_EERSTEN - 1 &&
    puntenRed === 6 &&
    puntenWhite === 6
  );
}

/**
 * Formats a finished partij the way the club writes it.
 *
 * `"5-5, 6-2"` — eersten before the deciding eerst, then the punten within it.
 * Without punten it degrades to plain eersten, e.g. `"6-3"`, since there is nothing
 * to describe the final eerst with.
 */
export function formatUitslag(u: Uitslag): string {
  const { eerstenRed, eerstenWhite, puntenLaatsteEerst } = u;

  if (!puntenLaatsteEerst) {
    return `${eerstenRed}-${eerstenWhite}`;
  }

  // The winner's final eerst is the one the punten describe, so it is not counted
  // again in the eersten half of the notation.
  const redWon = eerstenRed > eerstenWhite;
  const shownRed = redWon ? eerstenRed - 1 : eerstenRed;
  const shownWhite = redWon ? eerstenWhite : eerstenWhite - 1;

  return `${shownRed}-${shownWhite}, ${puntenLaatsteEerst[0]}-${puntenLaatsteEerst[1]}`;
}

/** Parses "6-2" into a punten pair. Returns null when the text is not that shape. */
export function parsePunten(text: string): [number, number] | null {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const allowed = new Set<number>([...PUNTEN_LADDER, ALLES_AAN_DE_HANG_PUNTEN]);
  if (!allowed.has(a) || !allowed.has(b)) return null;
  return [a, b];
}
