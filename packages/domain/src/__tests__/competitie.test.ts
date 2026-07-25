/**
 * Competitiestand en automatische aanwezigheid — spec §21/§29.
 */

import { sortStandings, computeSaldo, aggregateMatchLines, DEFAULT_SORT_ORDER } from '../competitie/standings.ts';
import {
  markPresentForMatch,
  finalizeRoundAttendance,
  reopenRoundAttendance,
  buildFinalizePreview,
  type AttendanceRecord,
} from '../competitie/attendance.ts';

const base = { afwezig: 0, gespeeld: 0, gewonnen: 0, verloren: 0 };

describe('sortStandings', () => {
  it('sorteert exact: eersten voor ↓, tegen ↑, saldo ↓, deelnames ↓, naam ↑', () => {
    const rows = sortStandings([
      { playerId: 'a', displayName: 'Anna', eerstenVoor: 30, eerstenTegen: 10, deelnames: 5, ...base },
      { playerId: 'b', displayName: 'Bouke', eerstenVoor: 32, eerstenTegen: 20, deelnames: 5, ...base },
      { playerId: 'c', displayName: 'Cees', eerstenVoor: 30, eerstenTegen: 8, deelnames: 5, ...base },
      { playerId: 'd', displayName: 'Douwe', eerstenVoor: 30, eerstenTegen: 10, deelnames: 6, ...base },
      { playerId: 'e', displayName: 'Aafke', eerstenVoor: 30, eerstenTegen: 10, deelnames: 5, ...base },
    ]);
    // b (32 voor) > c (30, minste tegen) > d (30/10, meer deelnames) > e/a op naam
    expect(rows.map((r) => r.playerId)).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(rows[3].displayName).toBe('Aafke'); // alfabetische fallback
  });

  it('berekent saldo = eersten voor − eersten tegen', () => {
    expect(computeSaldo(30, 12)).toBe(18);
    expect(computeSaldo(5, 9)).toBe(-4);
    const rows = sortStandings([
      { playerId: 'a', displayName: 'A', eerstenVoor: 12, eerstenTegen: 20, deelnames: 3, ...base },
    ]);
    expect(rows[0].saldo).toBe(-8);
  });

  it('gebruikt saldo pas ná eersten voor en eersten tegen', () => {
    const rows = sortStandings([
      // gelijk voor/tegen → saldo gelijk → deelnames beslist
      { playerId: 'x', displayName: 'X', eerstenVoor: 20, eerstenTegen: 10, deelnames: 3, ...base },
      { playerId: 'y', displayName: 'Y', eerstenVoor: 20, eerstenTegen: 10, deelnames: 7, ...base },
    ]);
    expect(rows[0].playerId).toBe('y');
  });

  it('geeft positie en stijging/daling t.o.v. de vorige speelavond', () => {
    const rows = sortStandings(
      [
        { playerId: 'a', displayName: 'A', eerstenVoor: 10, eerstenTegen: 5, deelnames: 2, ...base },
        { playerId: 'b', displayName: 'B', eerstenVoor: 20, eerstenTegen: 5, deelnames: 2, ...base },
      ],
      DEFAULT_SORT_ORDER,
      { a: 1, b: 2 },
    );
    expect(rows[0]).toMatchObject({ playerId: 'b', position: 1, delta: 1 }); // gestegen
    expect(rows[1]).toMatchObject({ playerId: 'a', position: 2, delta: -1 }); // gedaald
  });

  it('aggregateMatchLines telt eersten voor, tegen en winst/verlies correct', () => {
    const agg = aggregateMatchLines([
      { playerId: 'p', eerstenVoor: 6, eerstenTegen: 4, won: true },
      { playerId: 'p', eerstenVoor: 3, eerstenTegen: 6, won: false },
    ]);
    expect(agg.get('p')).toEqual({ eerstenVoor: 9, eerstenTegen: 10, gespeeld: 2, gewonnen: 1, verloren: 1 });
  });
});

describe('automatische aanwezigheid', () => {
  const empty = new Map<string, AttendanceRecord>();

  it('markeert alle spelers van een uitslag als aanwezig', () => {
    const after = markPresentForMatch(empty, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(after.size).toBe(6);
    expect(after.get('p1')).toEqual({ playerId: 'p1', status: 'present', source: 'auto' });
  });

  it('geeft max. één telling per speler per avond, ook bij meerdere partijen', () => {
    let att = markPresentForMatch(empty, ['p1', 'p2']);
    att = markPresentForMatch(att, ['p1', 'p3']); // p1 speelt tweede partij
    expect(att.size).toBe(3);
    expect([...att.keys()].filter((k) => k === 'p1')).toHaveLength(1);
  });

  it('overschrijft handmatige registraties nooit', () => {
    const manual = new Map<string, AttendanceRecord>([
      ['p1', { playerId: 'p1', status: 'injured', source: 'manual' }],
    ]);
    const after = markPresentForMatch(manual, ['p1']);
    expect(after.get('p1')!.status).toBe('injured');
  });

  it('zet bij afronden alle niet-verwerkte verwachte deelnemers op afwezig', () => {
    const att = markPresentForMatch(empty, ['p1', 'p2']);
    const final = finalizeRoundAttendance(att, ['p1', 'p2', 'p3', 'p4']);
    expect(final.get('p3')).toEqual({ playerId: 'p3', status: 'absent', source: 'auto' });
    expect(final.get('p4')!.status).toBe('absent');
    expect(final.get('p1')!.status).toBe('present');
  });

  it('heropenen verwijdert alleen automatische afwezigheid', () => {
    const att = new Map<string, AttendanceRecord>([
      ['p1', { playerId: 'p1', status: 'present', source: 'auto' }],
      ['p2', { playerId: 'p2', status: 'absent', source: 'auto' }],
      ['p3', { playerId: 'p3', status: 'absent', source: 'manual' }],
    ]);
    const reopened = reopenRoundAttendance(att);
    expect(reopened.has('p2')).toBe(false);
    expect(reopened.get('p3')!.status).toBe('absent'); // handmatig blijft
    expect(reopened.get('p1')!.status).toBe('present');
  });

  it('controlescherm groepeert aanwezig/niet verwerkt/afgemeld/geblesseerd/gast', () => {
    const att = new Map<string, AttendanceRecord>([
      ['p1', { playerId: 'p1', status: 'present', source: 'auto' }],
      ['p2', { playerId: 'p2', status: 'excused', source: 'manual' }],
      ['p3', { playerId: 'p3', status: 'injured', source: 'manual' }],
      ['p4', { playerId: 'p4', status: 'guest', source: 'manual' }],
    ]);
    const preview = buildFinalizePreview(att, ['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(preview).toEqual({
      aanwezig: ['p1'],
      afgemeld: ['p2'],
      geblesseerd: ['p3'],
      gast: ['p4'],
      nietVerwerkt: ['p5'],
    });
  });
});
