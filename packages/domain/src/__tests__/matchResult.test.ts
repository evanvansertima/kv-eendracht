/**
 * Uitslagvalidatie en vrije formatie — spec §15/§16/§20/§29.
 */

import { matchResultSchema, autoWinner, findPlayersInMultipleActiveMatches } from '../toernooi/matchResult.ts';
import { validateVrijeFormatie } from '../loting/vrijeFormatie.ts';
import { makePlayers } from './testUtils.ts';

describe('matchResultSchema', () => {
  it('accepteert een reguliere 6-4 uitslag', () => {
    const res = matchResultSchema.safeParse({ eerstenRed: 6, eerstenWhite: 4, winner: 'red' });
    expect(res.success).toBe(true);
  });

  it('weigert negatieve waarden', () => {
    const res = matchResultSchema.safeParse({ eerstenRed: -1, eerstenWhite: 4, winner: 'white' });
    expect(res.success).toBe(false);
  });

  it('weigert een winnaar met minder eersten (onmogelijke uitslag)', () => {
    const res = matchResultSchema.safeParse({ eerstenRed: 3, eerstenWhite: 6, winner: 'red' });
    expect(res.success).toBe(false);
  });

  it('weigert 6-6 (beide parturen kunnen niet winnen)', () => {
    const res = matchResultSchema.safeParse({ eerstenRed: 6, eerstenWhite: 6, winner: 'red' });
    expect(res.success).toBe(false);
  });

  it('weigert gelijkspel tenzij het systeem dit toestaat', () => {
    const nee = matchResultSchema.safeParse({ eerstenRed: 4, eerstenWhite: 4, winner: 'draw' });
    expect(nee.success).toBe(false);
    const ja = matchResultSchema.safeParse({ eerstenRed: 4, eerstenWhite: 4, winner: 'draw', allowDraw: true });
    expect(ja.success).toBe(true);
  });

  it('bepaalt de winnaar automatisch bij 6 eersten', () => {
    expect(autoWinner(6, 3)).toBe('red');
    expect(autoWinner(2, 6)).toBe('white');
    expect(autoWinner(5, 5)).toBeNull();
  });

  it('signaleert spelers in twee actieve wedstrijden', () => {
    const doubles = findPlayersInMultipleActiveMatches([
      { matchId: 'm1', playerIds: ['a', 'b'] },
      { matchId: 'm2', playerIds: ['b', 'c'] },
    ]);
    expect(doubles).toEqual(['b']);
  });
});

describe('validateVrijeFormatie', () => {
  const p = makePlayers(8);

  it('accepteert geldige parturen van 2 en 3', () => {
    const errors = validateVrijeFormatie([
      { teamNo: 1, players: [p[0], p[1], p[2]] },
      { teamNo: 2, players: [p[3], p[4]] },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('weigert een speler in twee parturen binnen hetzelfde toernooi', () => {
    const errors = validateVrijeFormatie([
      { teamNo: 1, players: [p[0], p[1]] },
      { teamNo: 2, players: [p[0], p[2]] },
    ]);
    expect(errors.join(' ')).toMatch(/één partuur/);
  });

  it('handhaaft het maximumaantal parturen (Vrije Formatie Beperkt)', () => {
    const errors = validateVrijeFormatie(
      [
        { teamNo: 1, players: [p[0], p[1]] },
        { teamNo: 2, players: [p[2], p[3]] },
        { teamNo: 3, players: [p[4], p[5]] },
      ],
      { maxTeams: 2 },
    );
    expect(errors.join(' ')).toMatch(/wachtlijst/i);
  });

  it('handhaaft niveaubeperkingen', () => {
    const errors = validateVrijeFormatie(
      [{ teamNo: 1, players: [{ ...p[0], skillLevel: 'C' }, { ...p[1], skillLevel: 'A' }] }],
      { maxLevel: 'B' },
    );
    expect(errors.join(' ')).toMatch(/maximumniveau/);
  });
});
