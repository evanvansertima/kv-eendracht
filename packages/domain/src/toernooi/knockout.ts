/**
 * Knock-out (afvalsysteem) + herkansingsronde — spec §10/§11.
 * Genereert een bracketstructuur met byes (staand nummer), doorzetregels en
 * optionele herkansingsbracket voor verliezers van omloop 1.
 */

import type { DrawTeam } from '../loting/types.ts';

export interface BracketSlot {
  teamNo: number | null; // null = nog onbekend; -1 = staand nummer (bye)
}

export interface BracketMatch {
  /** uniek binnen de bracketgeneratie, bv 'M-1-2' (bracket-omloop-nummer) */
  key: string;
  bracket: 'main' | 'consolation';
  roundNo: number; // omloop (1 = eerste omloop)
  matchNo: number; // wedstrijdnummer binnen omloop
  red: BracketSlot;
  white: BracketSlot;
  /** key van de partij waar de winnaar naartoe gaat */
  nextKey: string | null;
  nextSlot: 'red' | 'white' | null;
  /** alleen omloop 1 hoofdbracket: waar de verliezer naartoe gaat */
  consolationKey: string | null;
  consolationSlot: 'red' | 'white' | null;
  isBye: boolean;
}

export interface BracketResult {
  matches: BracketMatch[];
  mainRounds: number;
  consolationRounds: number;
  byes: number;
  messages: string[];
}

export interface KnockoutOptions {
  withConsolation?: boolean;
  thirdPlaceMatch?: boolean;
}

/** Naam van een omloop voor weergave. */
export function roundLabel(roundNo: number, totalRounds: number): string {
  const remaining = totalRounds - roundNo;
  if (remaining === 0) return 'Finale';
  if (remaining === 1) return 'Halve finale';
  if (remaining === 2) return 'Kwartfinale';
  return `${roundNo}e omloop`;
}

export function generateKnockout(teams: readonly DrawTeam[], options: KnockoutOptions = {}): BracketResult {
  const { withConsolation = false, thirdPlaceMatch = false } = options;
  const n = teams.length;
  const messages: string[] = [];

  if (n < 2) {
    return { matches: [], mainRounds: 0, consolationRounds: 0, byes: 0, messages: ['Minimaal 2 parturen nodig voor een afvalsysteem.'] };
  }

  // bracketgrootte = volgende macht van 2; byes = staand nummer
  const size = 2 ** Math.ceil(Math.log2(n));
  const byes = size - n;
  const rounds = Math.log2(size);
  if (byes > 0) {
    messages.push(`${byes} staand nummer${byes === 1 ? '' : 's'} (${n} parturen in een schema van ${size}).`);
  }

  // seeds: teams op volgorde van wedstrijdnummer; byes zo verspreid mogelijk
  // (standaard bracket seeding: 1 vs size, 2 vs size-1, ...)
  const slots: (number | null)[] = buildSeededSlots(teams.map((t) => t.teamNo), size);

  const matches: BracketMatch[] = [];

  // hoofdbracket
  for (let r = 1; r <= rounds; r++) {
    const matchesInRound = size / 2 ** r;
    for (let m = 1; m <= matchesInRound; m++) {
      const isLast = r === rounds;
      matches.push({
        key: `M-${r}-${m}`,
        bracket: 'main',
        roundNo: r,
        matchNo: m,
        red: { teamNo: null },
        white: { teamNo: null },
        nextKey: isLast ? null : `M-${r + 1}-${Math.ceil(m / 2)}`,
        nextSlot: isLast ? null : m % 2 === 1 ? 'red' : 'white',
        consolationKey: null,
        consolationSlot: null,
        isBye: false,
      });
    }
  }

  // omloop 1 vullen; laagste teamNo aan rode kant (begint aan de opslag)
  const round1 = matches.filter((m) => m.bracket === 'main' && m.roundNo === 1);
  for (let i = 0; i < round1.length; i++) {
    const a = slots[i * 2];
    const b = slots[i * 2 + 1];
    const [red, white] = orderByTeamNo(a, b);
    round1[i].red.teamNo = red;
    round1[i].white.teamNo = white;
    if (a === null || b === null) round1[i].isBye = true;
  }

  // byes direct doorzetten
  for (const m of round1) {
    if (!m.isBye || !m.nextKey) continue;
    const winner = m.red.teamNo ?? m.white.teamNo;
    const next = matches.find((x) => x.key === m.nextKey)!;
    if (m.nextSlot === 'red') next.red.teamNo = winner;
    else next.white.teamNo = winner;
  }

  // derde-plaatswedstrijd
  if (thirdPlaceMatch && rounds >= 2) {
    matches.push({
      key: `M-${rounds}-2`,
      bracket: 'main',
      roundNo: rounds,
      matchNo: 2,
      red: { teamNo: null },
      white: { teamNo: null },
      nextKey: null,
      nextSlot: null,
      consolationKey: null,
      consolationSlot: null,
      isBye: false,
    });
    // verliezers van de halve finales stromen door naar de derde-plaatswedstrijd
    const semi1 = matches.find((m) => m.key === `M-${rounds - 1}-1`);
    const semi2 = matches.find((m) => m.key === `M-${rounds - 1}-2`);
    if (semi1 && semi2) {
      semi1.consolationKey = `M-${rounds}-2`;
      semi1.consolationSlot = 'red';
      semi2.consolationKey = `M-${rounds}-2`;
      semi2.consolationSlot = 'white';
    }
    messages.push('Wedstrijd om de derde prijs ingeschakeld (verliezers halve finales).');
  }

  // herkansingsbracket: verliezers van échte partijen in omloop 1
  let consolationRounds = 0;
  if (withConsolation) {
    const realRound1 = round1.filter((m) => !m.isBye);
    const losers = realRound1.length;
    if (losers >= 2) {
      const cSize = 2 ** Math.ceil(Math.log2(losers));
      consolationRounds = Math.log2(cSize);
      for (let r = 1; r <= consolationRounds; r++) {
        const inRound = cSize / 2 ** r;
        for (let m = 1; m <= inRound; m++) {
          const isLast = r === consolationRounds;
          matches.push({
            key: `H-${r}-${m}`,
            bracket: 'consolation',
            roundNo: r,
            matchNo: m,
            red: { teamNo: null },
            white: { teamNo: null },
            nextKey: isLast ? null : `H-${r + 1}-${Math.ceil(m / 2)}`,
            nextSlot: isLast ? null : m % 2 === 1 ? 'red' : 'white',
            consolationKey: null,
            consolationSlot: null,
            isBye: false,
          });
        }
      }
      // koppel verliezers omloop 1 → herkansing omloop 1
      realRound1.forEach((m, i) => {
        m.consolationKey = `H-1-${Math.floor(i / 2) + 1}`;
        m.consolationSlot = i % 2 === 0 ? 'red' : 'white';
      });
      // bij oneven verliezers: laatste herkansingsslot blijft leeg → bye
      messages.push(`Herkansingsronde: ${losers} verliezers uit de eerste omloop stromen in.`);
    } else {
      messages.push('Te weinig partijen in de eerste omloop voor een herkansingsronde.');
    }
  }

  return { matches, mainRounds: rounds, consolationRounds, byes, messages };
}

/**
 * Winnaar doorzetten. Retourneert de bijgewerkte lijst (immutable) en
 * verwerkt ook de verliezer richting herkansing.
 */
export function advanceWinner(
  matches: readonly BracketMatch[],
  key: string,
  winnerTeamNo: number,
): BracketMatch[] {
  const list = matches.map((m) => ({ ...m, red: { ...m.red }, white: { ...m.white } }));
  const match = list.find((m) => m.key === key);
  if (!match) throw new Error(`Partij ${key} niet gevonden`);
  const { red, white } = match;
  if (red.teamNo !== winnerTeamNo && white.teamNo !== winnerTeamNo) {
    throw new Error(`Partuur ${winnerTeamNo} speelt niet in partij ${key}`);
  }
  const loserTeamNo = red.teamNo === winnerTeamNo ? white.teamNo : red.teamNo;

  if (match.nextKey) {
    const next = list.find((m) => m.key === match.nextKey)!;
    if (match.nextSlot === 'red') next.red.teamNo = winnerTeamNo;
    else next.white.teamNo = winnerTeamNo;
  }
  if (match.consolationKey && loserTeamNo !== null && loserTeamNo !== -1) {
    const cons = list.find((m) => m.key === match.consolationKey)!;
    if (match.consolationSlot === 'red') cons.red.teamNo = loserTeamNo;
    else cons.white.teamNo = loserTeamNo;
  }
  return list;
}

/**
 * Controle: een speler mag niet tegelijk in een actieve partij van de
 * hoofdronde én de herkansing staan (spec §11).
 */
export function findDoubleActivePlayers(
  activeMatches: ReadonlyArray<{ bracket: 'main' | 'consolation'; playerIds: string[] }>,
): string[] {
  const mainPlayers = new Set(activeMatches.filter((m) => m.bracket === 'main').flatMap((m) => m.playerIds));
  const doubles = new Set<string>();
  for (const m of activeMatches.filter((m) => m.bracket === 'consolation')) {
    for (const id of m.playerIds) if (mainPlayers.has(id)) doubles.add(id);
  }
  return [...doubles];
}

function orderByTeamNo(a: number | null, b: number | null): [number | null, number | null] {
  if (a === null) return [b, null];
  if (b === null) return [a, null];
  return a <= b ? [a, b] : [b, a];
}

/** Standaard seeding met byes verspreid: seed 1 en 2 in tegenovergestelde helften. */
function buildSeededSlots(teamNos: number[], size: number): (number | null)[] {
  const order = seedOrder(size);
  const slots: (number | null)[] = new Array(size).fill(null);
  for (let seed = 0; seed < teamNos.length; seed++) {
    slots[order[seed]] = teamNos[seed];
  }
  return slots;
}

/** Positie in de bracket per seed (1-gebaseerde standaard toernooiseeding). */
function seedOrder(size: number): number[] {
  let order = [0];
  let len = 1;
  while (len < size) {
    const next: number[] = [];
    len *= 2;
    for (const pos of order) {
      next.push(pos);
      next.push(len - 1 - pos);
    }
    order = next;
  }
  // order[i] = bracketpositie van seed i
  return order;
}
