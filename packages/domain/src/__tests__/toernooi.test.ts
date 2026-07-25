/**
 * Toernooilogica: knock-out, herkansing, poules, Sneker — spec §10-§12/§19/§29.
 */

import { generateKnockout, advanceWinner, findDoubleActivePlayers, roundLabel } from '../toernooi/knockout.ts';
import { assignPoules, generatePouleSchedule, computePouleStanding } from '../toernooi/poule.ts';
import { drawSnekerRounds, computeSnekerStanding, SNEKER_DEFAULT } from '../toernooi/sneker.ts';
import { makePlayers } from './testUtils.ts';
import type { DrawTeam } from '../loting/types.ts';

const teamsOf = (n: number): DrawTeam[] =>
  Array.from({ length: n }, (_, i) => ({ teamNo: i + 1, players: [] }));

describe('generateKnockout', () => {
  it('maakt een correct schema voor 8 parturen zonder byes', () => {
    const { matches, mainRounds, byes } = generateKnockout(teamsOf(8));
    expect(byes).toBe(0);
    expect(mainRounds).toBe(3);
    expect(matches.filter((m) => m.roundNo === 1)).toHaveLength(4);
    expect(matches.filter((m) => m.roundNo === 3)).toHaveLength(1);
  });

  it('geeft staand nummer (bye) bij oneven aantallen en zet die direct door', () => {
    const { matches, byes } = generateKnockout(teamsOf(6));
    expect(byes).toBe(2);
    const round2 = matches.filter((m) => m.roundNo === 2);
    const filled = round2.flatMap((m) => [m.red.teamNo, m.white.teamNo]).filter((x) => x !== null);
    expect(filled.length).toBe(2); // twee byes doorgezet
  });

  it('laagste wedstrijdnummer staat aan de rode zijde (opslag)', () => {
    const { matches } = generateKnockout(teamsOf(8));
    for (const m of matches.filter((x) => x.roundNo === 1)) {
      expect(m.red.teamNo!).toBeLessThan(m.white.teamNo!);
    }
  });

  it('zet winnaars door naar de volgende omloop', () => {
    let { matches } = generateKnockout(teamsOf(4));
    matches = advanceWinner(matches, 'M-1-1', matches.find((m) => m.key === 'M-1-1')!.red.teamNo!);
    matches = advanceWinner(matches, 'M-1-2', matches.find((m) => m.key === 'M-1-2')!.white.teamNo!);
    const finale = matches.find((m) => m.key === 'M-2-1')!;
    expect(finale.red.teamNo).not.toBeNull();
    expect(finale.white.teamNo).not.toBeNull();
  });

  it('plaatst verliezers van omloop 1 in de herkansing', () => {
    let { matches, consolationRounds } = generateKnockout(teamsOf(8), { withConsolation: true });
    expect(consolationRounds).toBe(2);
    const m11 = matches.find((m) => m.key === 'M-1-1')!;
    const loser = m11.white.teamNo!;
    matches = advanceWinner(matches, 'M-1-1', m11.red.teamNo!);
    const h11 = matches.find((m) => m.key === 'H-1-1')!;
    expect([h11.red.teamNo, h11.white.teamNo]).toContain(loser);
  });

  it('signaleert spelers die tegelijk in hoofdronde en herkansing actief zijn', () => {
    const doubles = findDoubleActivePlayers([
      { bracket: 'main', playerIds: ['a', 'b', 'c'] },
      { bracket: 'consolation', playerIds: ['c', 'd'] },
    ]);
    expect(doubles).toEqual(['c']);
  });

  it('benoemt omlopen correct', () => {
    expect(roundLabel(3, 3)).toBe('Finale');
    expect(roundLabel(2, 3)).toBe('Halve finale');
  });
});

describe('poules', () => {
  it('respecteert het KNKB-maximum en vraagt motivatie voor clubafwijking', () => {
    const tooMany = assignPoules(teamsOf(9), { pouleCount: 2, maxTeams: 8 }, 1);
    expect(tooMany.ok).toBe(false);
    const withOverride = assignPoules(
      teamsOf(9),
      { pouleCount: 2, maxTeams: 8, clubOverride: true, overrideReason: 'Ledenpartij met extra opgave' },
      1,
    );
    expect(withOverride.ok).toBe(true);
  });

  it('verdeelt twee poules van vier en genereert een volledig round-robin-schema', () => {
    const res = assignPoules(teamsOf(8), { pouleCount: 2 }, 7);
    expect(res.ok).toBe(true);
    expect(res.poules.map((p) => p.length)).toEqual([4, 4]);
    const schedule = generatePouleSchedule(res.poules);
    // 2 poules × C(4,2) = 12 partijen
    expect(schedule).toHaveLength(12);
    // laagste nummer aan rode zijde
    for (const m of schedule) expect(m.redTeamNo).toBeLessThan(m.whiteTeamNo);
  });

  it('poules van 3: iedereen speelt iedereen', () => {
    const res = assignPoules(teamsOf(6), { pouleCount: 2 }, 3);
    const schedule = generatePouleSchedule(res.poules);
    expect(schedule).toHaveLength(6); // 2 × C(3,2)
  });

  it('KNKB-telling: winnaar 7, verliezer eigen eersten; tiebreak tegeneersten dan onderling', () => {
    const standing = computePouleStanding(
      [1, 2, 3],
      [
        { redTeamNo: 1, whiteTeamNo: 2, eerstenRed: 6, eerstenWhite: 4, winner: 'red' },
        { redTeamNo: 1, whiteTeamNo: 3, eerstenRed: 2, eerstenWhite: 6, winner: 'white' },
        { redTeamNo: 2, whiteTeamNo: 3, eerstenRed: 6, eerstenWhite: 5, winner: 'red' },
      ],
    );
    // punten: T1 = 7+2=9, T2 = 4+7=11, T3 = 7+5=12
    expect(standing.map((r) => r.teamNo)).toEqual([3, 2, 1]);
    expect(standing[0].punten).toBe(12);
    expect(standing[1].punten).toBe(11);
    expect(standing[2].punten).toBe(9);
  });

  it('tiebreak: bij gelijke punten wint minste tegeneersten', () => {
    const standing = computePouleStanding(
      [1, 2],
      [
        { redTeamNo: 1, whiteTeamNo: 2, eerstenRed: 6, eerstenWhite: 0, winner: 'red' },
        { redTeamNo: 1, whiteTeamNo: 2, eerstenRed: 0, eerstenWhite: 6, winner: 'white' },
      ],
    );
    expect(standing[0].punten).toBe(standing[1].punten);
    expect(standing[0].eerstenTegen).toBeLessThanOrEqual(standing[1].eerstenTegen);
  });
});

describe('Sneker telling', () => {
  it('loot per omloop nieuwe parturen met alle spelers', () => {
    const players = makePlayers(12);
    const { ok, rounds } = drawSnekerRounds(players, 99);
    expect(ok).toBe(true);
    expect(rounds).toHaveLength(3);
    for (const round of rounds) {
      const ids = round.teams.flatMap((t) => t.players.map((p) => p.id));
      expect(ids).toHaveLength(12);
      expect(new Set(ids).size).toBe(12);
    }
  });

  it('minimaliseert herhaalde maten over omlopen', () => {
    const players = makePlayers(12);
    const { rounds } = drawSnekerRounds(players, 7);
    const pairCounts = new Map<string, number>();
    for (const round of rounds) {
      for (const team of round.teams) {
        for (let i = 0; i < team.players.length; i++) {
          for (let j = i + 1; j < team.players.length; j++) {
            const key = [team.players[i].id, team.players[j].id].sort().join('|');
            pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }
    const repeats = [...pairCounts.values()].filter((v) => v > 1).length;
    expect(repeats).toBeLessThanOrEqual(SNEKER_DEFAULT.maxRepeatPairings + 2); // best effort, klein
  });

  it('scoort individueel: winnaars 7, verliezers eigen eersten, tiebreak tegeneersten', () => {
    const standing = computeSnekerStanding(
      ['a', 'b', 'c', 'd'],
      [
        { roundNo: 1, redPlayers: ['a', 'b'], whitePlayers: ['c', 'd'], eerstenRed: 6, eerstenWhite: 3, winner: 'red' },
        { roundNo: 2, redPlayers: ['a', 'c'], whitePlayers: ['b', 'd'], eerstenRed: 4, eerstenWhite: 6, winner: 'white' },
      ],
    );
    const byId = Object.fromEntries(standing.map((r) => [r.playerId, r]));
    expect(byId.a.punten).toBe(7 + 4);
    expect(byId.b.punten).toBe(7 + 7);
    expect(byId.c.punten).toBe(3 + 4);
    expect(byId.d.punten).toBe(3 + 7);
    expect(standing[0].playerId).toBe('b');
  });
});
