/**
 * Verdeling van N spelers over parturen van 2 en 3 (spec §13).
 *
 * Zoek het kleinste EVEN aantal parturen T met ceil(N/3) <= T <= floor(N/2).
 * Dan: drietallen x = N - 2T, tweetallen y = 3T - N.
 * Deze keuze gebruikt alle spelers en maximaliseert het aantal drietallen
 * binnen de eis van een even aantal parturen.
 */

export interface Partition {
  totalTeams: number; // T (even)
  triples: number; // x
  pairs: number; // y
}

export interface PartitionOutcome {
  ok: boolean;
  partition?: Partition;
  /** Nederlandstalige uitleg wanneer geen geldige verdeling bestaat. */
  message?: string;
}

export function computePartition(n: number, requireEven = true): PartitionOutcome {
  if (!Number.isInteger(n) || n < 4) {
    return {
      ok: false,
      message:
        n < 4
          ? `Met ${n} speler${n === 1 ? '' : 's'} kan geen wedstrijd met een even aantal parturen worden gevormd. Minimaal 4 spelers nodig.`
          : 'Ongeldig aantal spelers.',
    };
  }

  const tMin = Math.ceil(n / 3);
  const tMax = Math.floor(n / 2);

  for (let t = tMin; t <= tMax; t++) {
    if (requireEven && t % 2 !== 0) continue;
    const triples = n - 2 * t;
    const pairs = 3 * t - n;
    if (triples >= 0 && pairs >= 0 && triples + pairs === t && 3 * triples + 2 * pairs === n) {
      return { ok: true, partition: { totalTeams: t, triples, pairs } };
    }
  }

  return {
    ok: false,
    message: `Met ${n} spelers is geen verdeling in twee- en drietallen met een even aantal parturen mogelijk. Zet één speler op de reservelijst of pas het aantal handmatig aan.`,
  };
}

/**
 * Verdeling inclusief oplossingsvoorstel: als N zelf niet past, probeer N-1
 * (één reserve). Er wordt nooit stilzwijgend iemand buiten de loting geplaatst;
 * de aanroeper toont het voorstel en de beheerder bevestigt.
 */
export interface PartitionSuggestion extends PartitionOutcome {
  reserves: number; // aantal spelers dat reserve zou staan (0 of 1)
}

export function computePartitionWithSuggestion(n: number): PartitionSuggestion {
  const direct = computePartition(n);
  if (direct.ok) return { ...direct, reserves: 0 };
  const withReserve = computePartition(n - 1);
  if (withReserve.ok) {
    return {
      ok: true,
      partition: withReserve.partition,
      reserves: 1,
      message: `Met ${n} spelers is geen even verdeling mogelijk. Voorstel: 1 speler op de reservelijst (${n - 1} spelers verdeeld over ${withReserve.partition!.totalTeams} parturen).`,
    };
  }
  return { ...direct, reserves: 0 };
}
