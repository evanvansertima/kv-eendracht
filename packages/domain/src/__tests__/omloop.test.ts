/**
 * Omloop-schema — het doorschuifsysteem met staand nummer.
 *
 * De kern van deze suite is het uitgewerkte voorbeeld van de club met 18 parturen,
 * omloop voor omloop nagespeeld tot de finale.
 */

import {
  pairOmloop,
  nextDeelnemers,
  generateOmloopSchema,
  advanceOmloop,
  countOmlopen,
  omloopLabel,
  defaultPouleLayout,
} from '../toernooi/omloop.ts';

/** Kort schrijfwijze: [[rood, wit], ...] */
function pairsOf(deelnemers: number[]) {
  return pairOmloop(deelnemers).partijen.map((p) => [p.redTeamNo, p.whiteTeamNo]);
}

describe('parturen koppelen', () => {
  it('koppelt recht van boven naar beneden', () => {
    expect(pairsOf([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('geeft het laatste partuur van een oneven lijst een staand nummer', () => {
    const { partijen, staandNummer } = pairOmloop([1, 3, 6, 7, 9, 11, 14, 15, 18]);
    expect(partijen).toHaveLength(4);
    expect(staandNummer).toBe(18);
  });

  it('heeft geen staand nummer bij een even lijst', () => {
    expect(pairOmloop([1, 2, 3, 4]).staandNummer).toBeNull();
  });

  it('zet het laagste nummer op rood, dat begint aan de opslag', () => {
    const { partijen } = pairOmloop([7, 2]);
    expect(partijen[0]).toMatchObject({ redTeamNo: 2, whiteTeamNo: 7 });
  });
});

describe('staand nummer schuift naar voren', () => {
  it('plaatst het doorgeschoven partuur boven aan de volgende omloop', () => {
    expect(nextDeelnemers([1, 6, 11, 15], 18)).toEqual([18, 1, 6, 11, 15]);
  });

  it('laat de volgorde ongemoeid zonder staand nummer', () => {
    expect(nextDeelnemers([1, 6, 11, 15], null)).toEqual([1, 6, 11, 15]);
  });

  it('voorkomt dat hetzelfde partuur telkens opnieuw doorschuift', () => {
    // Onderaan gelaten zou 18 elke oneven omloop opnieuw het staand nummer pakken.
    const eerste = nextDeelnemers([1, 6, 11, 15], 18);
    expect(pairOmloop(eerste).staandNummer).toBe(15);
    expect(pairOmloop(eerste).staandNummer).not.toBe(18);
  });
});

describe('het voorbeeld van de club: 18 parturen', () => {
  it('speelt 9 partijen in de 1e omloop', () => {
    const schema = generateOmloopSchema([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    const omloop1 = schema.omlopen[0]!;
    expect(omloop1.partijen).toHaveLength(9);
    expect(omloop1.staandNummer).toBeNull();
    expect(omloop1.partijen.map((p) => [p.redTeamNo, p.whiteTeamNo])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
      [13, 14],
      [15, 16],
      [17, 18],
    ]);
  });

  it('loopt precies zoals het voorbeeld tot en met de finale', () => {
    const start = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const totaal = countOmlopen(start.length);
    const schema = generateOmloopSchema(start);
    let omloop = schema.omlopen[0]!;

    // Omloop 1 → winnaars uit het voorbeeld.
    omloop = advanceOmloop(omloop, [1, 3, 6, 7, 9, 11, 14, 15, 18], totaal)!;
    expect(omloop.roundNo).toBe(2);
    expect(omloop.partijen.map((p) => [p.redTeamNo, p.whiteTeamNo])).toEqual([
      [1, 3],
      [6, 7],
      [9, 11],
      [14, 15],
    ]);
    expect(omloop.staandNummer).toBe(18);

    // Omloop 2 → 18 staat boven aan omloop 3.
    omloop = advanceOmloop(omloop, [1, 6, 11, 15], totaal)!;
    expect(omloop.roundNo).toBe(3);
    expect(omloop.deelnemers).toEqual([18, 1, 6, 11, 15]);
    expect(omloop.partijen.map((p) => [p.redTeamNo, p.whiteTeamNo])).toEqual([
      [1, 18],
      [6, 11],
    ]);
    expect(omloop.staandNummer).toBe(15);

    // Omloop 3 → 15 schuift door.
    omloop = advanceOmloop(omloop, [18, 6], totaal)!;
    expect(omloop.roundNo).toBe(4);
    expect(omloop.deelnemers).toEqual([15, 18, 6]);
    expect(omloop.partijen.map((p) => [p.redTeamNo, p.whiteTeamNo])).toEqual([[15, 18]]);
    expect(omloop.staandNummer).toBe(6);

    // Omloop 4 → de finale.
    omloop = advanceOmloop(omloop, [18], totaal)!;
    expect(omloop.roundNo).toBe(5);
    expect(omloop.deelnemers).toEqual([6, 18]);
    expect(omloop.partijen.map((p) => [p.redTeamNo, p.whiteTeamNo])).toEqual([[6, 18]]);
    expect(omloop.label).toBe('Finale');

    // En daarna is er niets meer.
    expect(advanceOmloop(omloop, [18], totaal)).toBeNull();
  });
});

describe('aantal omlopen', () => {
  it.each([
    [2, 1],
    [4, 2],
    [8, 3],
    [16, 4],
    [18, 5],
    [3, 2],
    [5, 3],
  ])('%i parturen → %i omlopen', (n, expected) => {
    expect(countOmlopen(n)).toBe(expected);
  });
});

describe('omloopnamen', () => {
  it('telt terug vanaf de finale', () => {
    expect(omloopLabel(5, 5)).toBe('Finale');
    expect(omloopLabel(4, 5)).toBe('Halve finale');
    expect(omloopLabel(3, 5)).toBe('Kwartfinale');
    expect(omloopLabel(1, 5)).toBe('1e omloop');
  });
});

describe('poule-indeling', () => {
  it('volgt de standaardtabel van de club', () => {
    expect(defaultPouleLayout(4).perPoule).toEqual([4]);
    expect(defaultPouleLayout(6).perPoule).toEqual([3, 3]);
    expect(defaultPouleLayout(8).perPoule).toEqual([4, 4]);
    expect(defaultPouleLayout(9).perPoule).toEqual([3, 3, 3]);
  });

  it('verdeelt andere aantallen zo gelijk mogelijk', () => {
    const { perPoule } = defaultPouleLayout(10);
    expect(perPoule.reduce((a, b) => a + b, 0)).toBe(10);
    expect(Math.max(...perPoule) - Math.min(...perPoule)).toBeLessThanOrEqual(1);
  });
});
