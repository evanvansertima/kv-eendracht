/**
 * Omloop-schema — the bracket the club actually plays.
 *
 * This is deliberately NOT the seeded power-of-two bracket in knockout.ts. That one
 * fills a 2^n grid and pre-places byes so seeds 1 and 2 meet in the final. This one is
 * the Frisian doorschuif: parturen are paired straight down the list, and when an omloop
 * has an odd number the one at the BOTTOM has no opponent and goes through.
 *
 * The rule that makes it work, and that is easy to get wrong: a partuur that advanced
 * without playing is placed FIRST in the next omloop. Left at the bottom it would draw
 * the bye again and again and reach the final without ever playing.
 *
 *   Omloop 1   1-2  3-4  5-6  7-8  9-10  11-12  13-14  15-16  17-18
 *   Omloop 2   1-3  6-7  9-11  14-15  18-x      (18 schuift door)
 *   Omloop 3   18-1  6-11  15-x                 (15 schuift door)
 *   Omloop 4   15-18  6-x                       (6 schuift door)
 *   Omloop 5   6-18                             finale
 */

export interface OmloopPartij {
  /** 1-based within the omloop. */
  matchNo: number;
  /** Lowest team number is red and serves first. */
  redTeamNo: number;
  whiteTeamNo: number;
}

export interface Omloop {
  /** 1-based. */
  roundNo: number;
  /** Dutch label: "1e omloop", "Halve finale", "Finale". */
  label: string;
  partijen: OmloopPartij[];
  /** The partuur that advanced without playing, if the omloop was odd. */
  staandNummer: number | null;
  /** The ordered list this omloop was played from. */
  deelnemers: number[];
}

export interface OmloopSchema {
  omlopen: Omloop[];
  messages: string[];
}

/**
 * Splits one omloop's ordered list into partijen.
 *
 * The last entry of an odd list gets no opponent — that is the staand nummer.
 */
export function pairOmloop(deelnemers: readonly number[]): {
  partijen: OmloopPartij[];
  staandNummer: number | null;
} {
  const partijen: OmloopPartij[] = [];
  let matchNo = 0;

  for (let i = 0; i + 1 < deelnemers.length; i += 2) {
    matchNo += 1;
    const a = deelnemers[i]!;
    const b = deelnemers[i + 1]!;
    // Lowest number is red and starts at the opslag.
    partijen.push({
      matchNo,
      redTeamNo: Math.min(a, b),
      whiteTeamNo: Math.max(a, b),
    });
  }

  const staandNummer = deelnemers.length % 2 === 1 ? deelnemers[deelnemers.length - 1]! : null;
  return { partijen, staandNummer };
}

/**
 * The list for the next omloop.
 *
 * The staand nummer goes to the front; the winners follow in the order their partijen
 * were played.
 */
export function nextDeelnemers(
  winners: readonly number[],
  staandNummer: number | null,
): number[] {
  return staandNummer === null ? [...winners] : [staandNummer, ...winners];
}

/** Dutch name for an omloop, counting back from the final. */
export function omloopLabel(roundNo: number, totalRounds: number): string {
  const remaining = totalRounds - roundNo;
  if (remaining === 0) return 'Finale';
  if (remaining === 1) return 'Halve finale';
  if (remaining === 2) return 'Kwartfinale';
  return `${roundNo}e omloop`;
}

/** How many omlopen a starting field needs, given that a staand nummer also advances. */
export function countOmlopen(n: number): number {
  let remaining = n;
  let rounds = 0;
  while (remaining > 1) {
    // Each partij produces one winner; an odd one out advances untouched.
    remaining = Math.floor(remaining / 2) + (remaining % 2);
    rounds += 1;
  }
  return rounds;
}

/**
 * Builds the opening omloop, and the empty shells for the omlopen that follow.
 *
 * Only the first omloop has known parturen: everything after it depends on results, so
 * later omlopen are filled in by `advanceOmloop` as they are played.
 */
export function generateOmloopSchema(teamNos: readonly number[]): OmloopSchema {
  const messages: string[] = [];

  if (teamNos.length < 2) {
    return { omlopen: [], messages: ['Minimaal 2 parturen nodig voor een schema.'] };
  }

  const total = countOmlopen(teamNos.length);
  const { partijen, staandNummer } = pairOmloop(teamNos);

  if (staandNummer !== null) {
    messages.push(
      `Partuur ${staandNummer} heeft een staand nummer en gaat door naar de volgende omloop.`,
    );
  }
  messages.push(
    `${teamNos.length} parturen, ${partijen.length} partij${partijen.length === 1 ? '' : 'en'} in de 1e omloop, ${total} omlopen tot de finale.`,
  );

  return {
    omlopen: [
      {
        roundNo: 1,
        label: omloopLabel(1, total),
        partijen,
        staandNummer,
        deelnemers: [...teamNos],
      },
    ],
    messages,
  };
}

/**
 * Produces the next omloop from the winners of the current one.
 *
 * `winners` must be in the order the partijen were played — that ordering is what makes
 * the schema reproducible, and it is why the caller passes results rather than a set.
 */
export function advanceOmloop(
  current: Omloop,
  winners: readonly number[],
  totalRounds: number,
): Omloop | null {
  const deelnemers = nextDeelnemers(winners, current.staandNummer);
  if (deelnemers.length < 2) return null;

  const { partijen, staandNummer } = pairOmloop(deelnemers);
  const roundNo = current.roundNo + 1;

  return {
    roundNo,
    label: omloopLabel(roundNo, totalRounds),
    partijen,
    staandNummer,
    deelnemers,
  };
}

/**
 * Default poule layout for a field size.
 *
 * The club's table:  4 → 1×4 · 6 → 2×3 · 8 → 2×4 · 9 → 3×3.
 * Anything else falls back to groups of at most four, which keeps a poule playable in
 * one afternoon.
 */
export function defaultPouleLayout(teamCount: number): { poules: number; perPoule: number[] } {
  const table: Record<number, number[]> = {
    4: [4],
    6: [3, 3],
    8: [4, 4],
    9: [3, 3, 3],
  };

  const known = table[teamCount];
  if (known) return { poules: known.length, perPoule: known };

  const groups = Math.max(1, Math.ceil(teamCount / 4));
  const base = Math.floor(teamCount / groups);
  const remainder = teamCount % groups;
  const perPoule = Array.from({ length: groups }, (_, i) => base + (i < remainder ? 1 : 0));
  return { poules: groups, perPoule };
}
