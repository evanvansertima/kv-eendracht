/**
 * Lotingstests — spec §13/§14/§17/§18/§29.
 * Deterministisch via vaste seeds.
 */

import { computePartition } from '../loting/partition.ts';
import { drawByRanking } from '../loting/ranking.ts';
import { drawDel } from '../loting/del.ts';
import { drawDelAbc, validateAbcTeam } from '../loting/delAbc.ts';
import { drawTweeTegenTwee } from '../loting/tweeTegenTwee.ts';
import { drawPearke } from '../loting/pearke.ts';
import { makePlayers, makeAbcPlayers, makeGenderPlayers } from './testUtils.ts';

const SEED = 42;

describe('computePartition (verdeling 2- en 3-tallen, even parturen)', () => {
  it.each([
    [10, 4, 2, 2], // 10 spelers: 2 drietallen + 2 tweetallen = 4 parturen
    [17, 6, 5, 1],
    [18, 6, 6, 0],
    [23, 8, 7, 1],
    [25, 10, 5, 5],
    [27, 10, 7, 3],
    [35, 12, 11, 1],
    [37, 14, 9, 5],
  ])('N=%i → T=%i (drietallen=%i, tweetallen=%i)', (n, t, x, y) => {
    const res = computePartition(n);
    expect(res.ok).toBe(true);
    expect(res.partition).toEqual({ totalTeams: t, triples: x, pairs: y });
  });

  it('vindt voor alle even deelbare N in 4..100 een geldige, even verdeling', () => {
    for (let n = 4; n <= 100; n++) {
      const res = computePartition(n);
      if (!res.ok) {
        // alleen N waarvoor mathematisch geen even T bestaat (bv. 5, 7)
        expect(res.message).toContain('geen');
        continue;
      }
      const { totalTeams, triples, pairs } = res.partition!;
      expect(totalTeams % 2).toBe(0);
      expect(triples).toBeGreaterThanOrEqual(0);
      expect(pairs).toBeGreaterThanOrEqual(0);
      expect(triples + pairs).toBe(totalTeams);
      expect(3 * triples + 2 * pairs).toBe(n);
      // kleinste even T → maximaal aantal drietallen
      const smallerEven = totalTeams - 2;
      if (smallerEven >= Math.ceil(n / 3)) {
        expect(n - 2 * smallerEven > n || 3 * smallerEven - n < 0).toBe(true);
      }
    }
  });

  it('weigert onmogelijke aantallen met duidelijke melding (geen stille uitsluiting)', () => {
    for (const n of [2, 3, 7]) {
      const res = computePartition(n);
      expect(res.ok).toBe(false);
      expect(res.message).toBeTruthy();
    }
  });
});

describe('drawDel (D.E.L.)', () => {
  it('gebruikt iedere speler exact één keer (N=2..100 waar mogelijk)', () => {
    for (let n = 2; n <= 100; n++) {
      const players = makePlayers(n);
      const result = drawDel(players, SEED + n);
      if (!result.ok) continue;
      const ids = result.teams.flatMap((t) => t.players.map((p) => p.id));
      expect(ids.length).toBe(n); // alle spelers gebruikt
      expect(new Set(ids).size).toBe(n); // geen dubbele spelers
      expect(result.teams.length % 2).toBe(0); // even aantal parturen
      for (const team of result.teams) {
        expect([2, 3]).toContain(team.players.length);
      }
    }
  });

  it('is reproduceerbaar met dezelfde seed en anders met een andere seed', () => {
    const players = makePlayers(18);
    const a = drawDel(players, 123);
    const b = drawDel(players, 123);
    const c = drawDel(players, 456);
    expect(a.teams).toEqual(b.teams);
    expect(JSON.stringify(a.teams)).not.toEqual(JSON.stringify(c.teams));
  });

  it('nummer 1 is het laagste wedstrijdnummer (opslag)', () => {
    const result = drawDel(makePlayers(12), SEED);
    expect(result.teams[0].teamNo).toBe(1);
    const nos = result.teams.map((t) => t.teamNo);
    expect(nos).toEqual([...nos].sort((x, y) => x - y));
  });
});

describe('drawDelAbc (D.E.L. ABC, strikte modus)', () => {
  it('elk partuur bevat exact één A, één B en één C', () => {
    const result = drawDelAbc(makeAbcPlayers(6, 6, 6), SEED);
    expect(result.ok).toBe(true);
    expect(result.teams.length).toBe(6);
    for (const team of result.teams) {
      expect(validateAbcTeam(team)).toBeNull();
      const levels = team.players.map((p) => p.skillLevel).sort();
      expect(levels).toEqual(['A', 'B', 'C']);
    }
    expect(result.reserves).toHaveLength(0);
  });

  it('gebruikt het grootste even aantal complete parturen en legt reserves uit', () => {
    // 5 A, 4 B, 3 C → 3 compleet mogelijk → even: 2 parturen, 6 reserves
    const result = drawDelAbc(makeAbcPlayers(5, 4, 3), SEED);
    expect(result.ok).toBe(true);
    expect(result.teams).toHaveLength(2);
    expect(result.reserves).toHaveLength(12 - 6);
    expect(result.messages.join(' ')).toMatch(/te veel|oneven/i);
    for (const r of result.reserves) expect(r.reason).toBeTruthy();
  });

  it('geeft ontbrekend niveau expliciet aan', () => {
    const result = drawDelAbc(makeAbcPlayers(3, 3, 0), SEED);
    expect(result.ok).toBe(false);
    expect(result.messages.join(' ')).toMatch(/C/);
  });

  it('waarschuwt bij handmatige aanpassing die de balans verbreekt', () => {
    const players = makeAbcPlayers(2, 2, 2);
    const result = drawDelAbc(players, SEED);
    const broken = { ...result.teams[0], players: [players[0], players[1], players[2]] }; // A,A,B
    expect(validateAbcTeam(broken)).toMatch(/ABC-balans/);
  });
});

describe('drawTweeTegenTwee (2 tegen 2)', () => {
  it('parturen van exact 2, even aantal, rest reserve', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10, 13]) {
      const result = drawTweeTegenTwee(makePlayers(n), SEED + n);
      expect(result.ok).toBe(true);
      expect(result.teams.length % 2).toBe(0);
      for (const team of result.teams) expect(team.players).toHaveLength(2);
      const used = result.teams.flatMap((t) => t.players.map((p) => p.id));
      expect(used.length + result.reserves.length).toBe(n);
      expect(new Set(used).size).toBe(used.length);
    }
  });
});

describe('drawPearke', () => {
  it('vormt dame+heer-paren en benoemt ontbrekende combinaties', () => {
    const result = drawPearke(makeGenderPlayers(5, 3), SEED);
    expect(result.ok).toBe(true);
    expect(result.teams).toHaveLength(3);
    for (const team of result.teams) {
      const genders = team.players.map((p) => p.gender).sort();
      expect(genders).toEqual(['dame', 'heer']);
    }
    expect(result.reserves).toHaveLength(2);
    expect(result.messages.join(' ')).toMatch(/te kort/);
  });

  it('vereist motivatie voor een afwijkende samenstelling', () => {
    const noReason = drawPearke(makeGenderPlayers(2, 2), SEED, { mixedRequired: false });
    expect(noReason.ok).toBe(false);
    const withReason = drawPearke(makeGenderPlayers(2, 2), SEED, {
      mixedRequired: false,
      overrideReason: 'Inclusieve variant tijdens jeugddag',
    });
    expect(withReason.ok).toBe(true);
  });
});

describe('drawByRanking', () => {
  const ranked = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      displayName: `Speler ${String.fromCharCode(65 + i)}`,
      ranking: i + 1,
    }));

  it('verdeelt A t/m F als 1: A,C,E en 2: B,D,F', () => {
    // Het voorbeeld uit de opdracht.
    const res = drawByRanking(ranked(6), 3);
    expect(res.ok).toBe(true);
    expect(res.teams).toHaveLength(2);
    expect(res.teams[0].players.map((p) => p.displayName)).toEqual([
      'Speler A',
      'Speler C',
      'Speler E',
    ]);
    expect(res.teams[1].players.map((p) => p.displayName)).toEqual([
      'Speler B',
      'Speler D',
      'Speler F',
    ]);
  });

  it('past hetzelfde principe toe op elk volgend blok', () => {
    const res = drawByRanking(ranked(12), 3);
    expect(res.teams).toHaveLength(4);
    // Tweede blok: G,I,K tegen H,J,L — spelers 7 t/m 12.
    expect(res.teams[2].players.map((p) => p.displayName)).toEqual([
      'Speler G',
      'Speler I',
      'Speler K',
    ]);
    expect(res.teams[3].players.map((p) => p.displayName)).toEqual([
      'Speler H',
      'Speler J',
      'Speler L',
    ]);
  });

  it('werkt ook met tweetallen', () => {
    const res = drawByRanking(ranked(4), 2);
    expect(res.teams[0].players.map((p) => p.displayName)).toEqual(['Speler A', 'Speler C']);
    expect(res.teams[1].players.map((p) => p.displayName)).toEqual(['Speler B', 'Speler D']);
  });

  it('zet spelers die niet in een volledig blok passen op de reservelijst', () => {
    const res = drawByRanking(ranked(8), 3);
    expect(res.teams).toHaveLength(2); // 6 gebruikt
    expect(res.reserves).toHaveLength(2);
    expect(res.reserves[0].reason).toMatch(/blok van 6/);
  });

  it('deelt spelers zonder competitiestand onderaan in', () => {
    const players = [
      { id: 'x', displayName: 'Zonder stand' },
      ...ranked(6),
    ];
    const res = drawByRanking(players, 3);
    // De ongerankte speler valt buiten het eerste blok van 6.
    expect(res.reserves.map((r) => r.player.displayName)).toContain('Zonder stand');
    expect(res.messages.some((m) => m.includes('zonder competitiestand'))).toBe(true);
  });

  it('weigert te loten bij te weinig spelers', () => {
    const res = drawByRanking(ranked(4), 3);
    expect(res.ok).toBe(false);
    expect(res.messages[0]).toMatch(/minimaal 6 spelers/);
  });
});
