/**
 * Uitslagvalidatie — spec §20.
 * Reguliere kaatspartij: winnaar bij 6 eersten. Zod-schema + domeinchecks.
 */

import { z } from 'zod';

export const MAX_EERSTEN = 6;

export const matchResultSchema = z
  .object({
    eerstenRed: z.number().int('Eersten zijn hele getallen').min(0, 'Eersten kunnen niet negatief zijn').max(MAX_EERSTEN, `Maximaal ${MAX_EERSTEN} eersten`),
    eerstenWhite: z.number().int('Eersten zijn hele getallen').min(0, 'Eersten kunnen niet negatief zijn').max(MAX_EERSTEN, `Maximaal ${MAX_EERSTEN} eersten`),
    winner: z.enum(['red', 'white', 'draw']),
    pointsLastEerst: z.string().max(10).optional(),
    note: z.string().max(500).optional(),
    allowDraw: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.winner === 'draw' && !val.allowDraw) {
      ctx.addIssue({ code: 'custom', message: 'Dit wedstrijdsysteem staat geen gelijkspel toe; kies een winnaar.' });
    }
    if (val.winner === 'red' && val.eerstenRed < val.eerstenWhite) {
      ctx.addIssue({ code: 'custom', message: 'Onmogelijke uitslag: het winnende partuur heeft minder eersten.' });
    }
    if (val.winner === 'white' && val.eerstenWhite < val.eerstenRed) {
      ctx.addIssue({ code: 'custom', message: 'Onmogelijke uitslag: het winnende partuur heeft minder eersten.' });
    }
    if (val.eerstenRed === MAX_EERSTEN && val.eerstenWhite === MAX_EERSTEN) {
      ctx.addIssue({ code: 'custom', message: 'Beide parturen kunnen niet allebei 6 eersten hebben.' });
    }
    if (val.winner === 'red' && val.eerstenRed < MAX_EERSTEN && val.eerstenWhite < MAX_EERSTEN && !val.allowDraw) {
      // toegestaan (opgave/blessure), maar de UI vraagt bevestiging
    }
  });

export type MatchResultInput = z.input<typeof matchResultSchema>;

/** Bepaalt automatisch de winnaar zodra één partij 6 eersten heeft. */
export function autoWinner(eerstenRed: number, eerstenWhite: number): 'red' | 'white' | null {
  if (eerstenRed >= MAX_EERSTEN && eerstenWhite < MAX_EERSTEN) return 'red';
  if (eerstenWhite >= MAX_EERSTEN && eerstenRed < MAX_EERSTEN) return 'white';
  return null;
}

/**
 * Spelers mogen niet tegelijk in twee actieve (live) wedstrijden staan.
 * Retourneert de ids die dubbel voorkomen.
 */
export function findPlayersInMultipleActiveMatches(
  activeMatches: ReadonlyArray<{ matchId: string; playerIds: string[] }>,
): string[] {
  const seen = new Map<string, string>();
  const doubles = new Set<string>();
  for (const m of activeMatches) {
    for (const id of m.playerIds) {
      const other = seen.get(id);
      if (other && other !== m.matchId) doubles.add(id);
      seen.set(id, m.matchId);
    }
  }
  return [...doubles];
}
