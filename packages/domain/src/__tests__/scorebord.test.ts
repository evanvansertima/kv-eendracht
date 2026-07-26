/**
 * LIVE scorebord — de spelregels als toestandsmachine.
 */

import {
  createScorebord,
  awardPoint,
  placeKaats,
  removeKaats,
  isDecidingPoint,
  formatKlok,
  elapsedMs,
  type ScorebordState,
} from '../competitie/scorebord.ts';

/** Kent n punten toe aan dezelfde partij, met oplopende tijd. */
function punten(state: ScorebordState, side: 'red' | 'white', n: number): ScorebordState {
  let s = state;
  for (let i = 0; i < n; i++) s = awardPoint(s, side, 1000 * (i + 1));
  return s;
}

describe('puntenladder', () => {
  it('loopt 0 → 2 → 4 → 6 en wint dan een eerst', () => {
    let s = createScorebord();
    s = awardPoint(s, 'red', 1);
    expect(s.puntenRed).toBe(2);
    s = awardPoint(s, 'red', 2);
    expect(s.puntenRed).toBe(4);
    s = awardPoint(s, 'red', 3);
    expect(s.puntenRed).toBe(6);

    // Het vierde punt wint het eerst en zet de punten terug op 0.
    s = awardPoint(s, 'red', 4);
    expect(s.eerstenRed).toBe(1);
    expect(s.puntenRed).toBe(0);
  });

  it('houdt de punten van beide parturen los van elkaar bij', () => {
    let s = createScorebord();
    s = punten(s, 'red', 2); // 4
    s = punten(s, 'white', 1); // 2
    expect(s.puntenRed).toBe(4);
    expect(s.puntenWhite).toBe(2);
  });

  it('wint de partij bij zes eersten', () => {
    let s = createScorebord();
    for (let e = 0; e < 6; e++) s = punten(s, 'red', 4);
    expect(s.eerstenRed).toBe(6);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe('red');
  });

  it('negeert punten nadat de partij gewonnen is', () => {
    let s = createScorebord();
    for (let e = 0; e < 6; e++) s = punten(s, 'red', 4);
    const after = awardPoint(s, 'white', 9999);
    expect(after).toBe(s);
  });
});

describe('alles aan de hang', () => {
  /** 5-5 in eersten en 6-6 in punten. */
  function allesAanDeHang(): ScorebordState {
    let s = createScorebord();
    for (let e = 0; e < 5; e++) s = punten(s, 'red', 4);
    for (let e = 0; e < 5; e++) s = punten(s, 'white', 4);
    s = punten(s, 'red', 3); // 6 punten
    s = punten(s, 'white', 3); // 6 punten
    return s;
  }

  it('herkent het beslissende punt', () => {
    const s = allesAanDeHang();
    expect(s.eerstenRed).toBe(5);
    expect(s.eerstenWhite).toBe(5);
    expect(s.puntenRed).toBe(6);
    expect(s.puntenWhite).toBe(6);
    expect(isDecidingPoint(s)).toBe(true);
  });

  it('beslist de hele partij met het volgende punt', () => {
    const s = awardPoint(allesAanDeHang(), 'white', 10_000);
    expect(s.eerstenWhite).toBe(6);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe('white');
  });

  it('noteert het beslissende punt als 8 in het logboek', () => {
    const s = awardPoint(allesAanDeHang(), 'red', 10_000);
    // Het láátste eerst is het beslissende; de tien daarvoor zijn gewone eersten.
    const eersten = s.log.filter((l) => l.action === 'eerst');
    expect(eersten[eersten.length - 1]?.text).toContain('8 punten');
  });
});

describe('kaatsen', () => {
  it('plaatst eerst de 1e kaats en pas daarna de 2e', () => {
    let s = createScorebord();
    s = placeKaats(s, 1);
    expect(s.kaats1).toBe(true);
    expect(s.kaats2).toBe(false);

    s = placeKaats(s, 2);
    expect(s.kaats2).toBe(true);
  });

  it('verandert de stand niet', () => {
    let s = createScorebord();
    s = placeKaats(s, 1);
    expect(s.puntenRed).toBe(0);
    expect(s.puntenWhite).toBe(0);
    expect(s.eerstenRed).toBe(0);
  });

  it('wisselt opslag zodra er twee kaatsen liggen', () => {
    let s = createScorebord('red');
    s = placeKaats(s, 1);
    expect(s.opslag).toBe('red');
    s = placeKaats(s, 2);
    expect(s.opslag).toBe('white');
    expect(s.log.some((l) => l.action === 'wissel')).toBe(true);
  });

  it('wisselt ook bij één kaats als een partuur op 6 punten staat', () => {
    let s = createScorebord('red');
    s = punten(s, 'red', 3); // 6 punten
    expect(s.opslag).toBe('red');
    s = placeKaats(s, 100);
    expect(s.opslag).toBe('white');
  });

  it('wisselt als de 1e kaats ligt en een partuur daarna op 6 punten komt', () => {
    let s = createScorebord('red');
    s = placeKaats(s, 1);
    expect(s.opslag).toBe('red');
    s = punten(s, 'white', 3); // wit naar 6 punten
    expect(s.opslag).toBe('white');
  });

  it('laat na de wissel de 1e kaats verdwijnen bij het volgende punt, de 2e blijft', () => {
    let s = createScorebord('red');
    s = placeKaats(s, 1);
    s = placeKaats(s, 2); // wissel
    expect(s.kaats1).toBe(true);
    expect(s.kaats2).toBe(true);

    s = awardPoint(s, 'red', 200);
    expect(s.kaats1).toBe(false); // gespeeld
    expect(s.kaats2).toBe(true); // blijft tot die ook gespeeld is
  });

  it('laat beide kaatsen verdwijnen zodra een eerst gewonnen is', () => {
    let s = createScorebord();
    s = placeKaats(s, 1);
    s = placeKaats(s, 2);
    s = punten(s, 'red', 4); // eerst gewonnen
    expect(s.kaats1).toBe(false);
    expect(s.kaats2).toBe(false);
  });

  it('verwijdert de laatst geplaatste kaats', () => {
    let s = createScorebord();
    s = placeKaats(s, 1);
    s = placeKaats(s, 2);
    s = removeKaats(s, 3);
    expect(s.kaats2).toBe(false);
    expect(s.kaats1).toBe(true);
    s = removeKaats(s, 4);
    expect(s.kaats1).toBe(false);
  });
});

describe('timer en logboek', () => {
  it('start de klok pas bij het eerste punt', () => {
    const s = createScorebord();
    expect(s.startedAtMs).toBeNull();
    expect(elapsedMs(s, 5000)).toBe(0);

    const after = awardPoint(s, 'red', 5000);
    expect(after.startedAtMs).toBe(5000);
    expect(elapsedMs(after, 8000)).toBe(3000);
  });

  it('legt elke actie vast met stand en tijd', () => {
    let s = createScorebord();
    s = awardPoint(s, 'red', 1000);
    s = placeKaats(s, 2000);

    expect(s.log).toHaveLength(2);
    expect(s.log[0]).toMatchObject({ action: 'punt', side: 'red', atMs: 0 });
    expect(s.log[1]).toMatchObject({ action: 'kaats-geplaatst', atMs: 1000 });
    expect(s.log[1].text).toBe('1e kaats geplaatst');
  });

  it('toont mm:ss en pas na een uur h:mm:ss', () => {
    expect(formatKlok(0)).toBe('00:00');
    expect(formatKlok(65_000)).toBe('01:05');
    expect(formatKlok(3_725_000)).toBe('1:02:05');
  });
});

describe('onveranderlijkheid', () => {
  it('muteert de vorige toestand niet, zodat ongedaan maken werkt', () => {
    const before = createScorebord();
    const after = awardPoint(before, 'red', 1);
    expect(before.puntenRed).toBe(0);
    expect(after.puntenRed).toBe(2);
    expect(before.log).toHaveLength(0);
  });
});
