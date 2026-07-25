/**
 * Verificatiescript voor de kritieke domeinlogica (spec §13/§29).
 * Draait zonder Jest: `npm run verify` (via tsx) of met de ingebouwde
 * Node-testrunner. Dekt dezelfde kernassertions als de Jest-suite, inclusief
 * de volledige range 2 t/m 100 spelers.
 */

import assert from 'node:assert/strict';

import { computePartition, computePartitionWithSuggestion } from './src/loting/partition.ts';
import { drawDel } from './src/loting/del.ts';
import { drawDelAbc, validateAbcTeam } from './src/loting/delAbc.ts';
import { drawTweeTegenTwee } from './src/loting/tweeTegenTwee.ts';
import { drawPearke } from './src/loting/pearke.ts';
import { generateKnockout, advanceWinner, findDoubleActivePlayers } from './src/toernooi/knockout.ts';
import { assignPoules, generatePouleSchedule, computePouleStanding } from './src/toernooi/poule.ts';
import { drawSnekerRounds, computeSnekerStanding } from './src/toernooi/sneker.ts';
import { sortStandings, computeSaldo } from './src/competitie/standings.ts';
import {
  markPresentForMatch,
  finalizeRoundAttendance,
  reopenRoundAttendance,
  type AttendanceRecord,
} from './src/competitie/attendance.ts';
import type { DrawPlayer } from './src/loting/types.ts';

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

const makePlayers = (n: number): DrawPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, displayName: `Speler ${i + 1}` }));

console.log('— Partitie 2/3-tallen (spec §13) —');

check('bekende gevallen: 10,17,18,23,25,27,35,37', () => {
  const expected: Record<number, [number, number, number]> = {
    10: [4, 2, 2], 17: [6, 5, 1], 18: [6, 6, 0], 23: [8, 7, 1],
    25: [10, 5, 5], 27: [10, 7, 3], 35: [12, 11, 1], 37: [14, 9, 5],
  };
  for (const [n, [t, x, y]] of Object.entries(expected)) {
    const res = computePartition(Number(n));
    assert.ok(res.ok, `N=${n} moet lukken`);
    assert.deepEqual(res.partition, { totalTeams: t, triples: x, pairs: y }, `N=${n}`);
  }
});

check('alle N=2..100: even T, x,y ≥ 0, x+y=T, 3x+2y=N of duidelijke melding', () => {
  for (let n = 2; n <= 100; n++) {
    const res = computePartition(n);
    if (!res.ok) {
      assert.ok(res.message && res.message.length > 10, `N=${n}: melding vereist`);
      assert.ok([2, 3, 7].includes(n), `N=${n} hoort oplosbaar te zijn`);
      continue;
    }
    const { totalTeams, triples, pairs } = res.partition!;
    assert.equal(totalTeams % 2, 0, `N=${n}: even parturen`);
    assert.ok(triples >= 0 && pairs >= 0, `N=${n}: niet-negatief`);
    assert.equal(triples + pairs, totalTeams, `N=${n}: x+y=T`);
    assert.equal(3 * triples + 2 * pairs, n, `N=${n}: alle spelers`);
  }
});

check('onoplosbare N (7) krijgt reservevoorstel; N=5 lost direct op (1+1)', () => {
  const seven = computePartitionWithSuggestion(7);
  assert.ok(seven.ok && seven.reserves === 1, 'N=7: voorstel met 1 reserve');
  const five = computePartition(5);
  assert.ok(five.ok, 'N=5 is direct oplosbaar');
  assert.deepEqual(five.partition, { totalTeams: 2, triples: 1, pairs: 1 });
});

console.log('— D.E.L.-loting —');

check('N=2..100: iedere speler exact één keer, even parturen, reproduceerbaar', () => {
  for (let n = 2; n <= 100; n++) {
    const players = makePlayers(n);
    const a = drawDel(players, 1000 + n);
    if (!a.ok) continue;
    const ids = a.teams.flatMap((t) => t.players.map((p) => p.id));
    assert.equal(ids.length, n, `N=${n}: alle spelers gebruikt`);
    assert.equal(new Set(ids).size, n, `N=${n}: geen dubbele spelers`);
    assert.equal(a.teams.length % 2, 0, `N=${n}: even parturen`);
    const b = drawDel(players, 1000 + n);
    assert.deepEqual(a.teams, b.teams, `N=${n}: zelfde seed → zelfde loting`);
  }
});

console.log('— D.E.L. ABC —');

check('6/6/6 → 6 strikte ABC-parturen zonder reserves', () => {
  const players = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `A${i}`, displayName: `A${i}`, skillLevel: 'A' as const })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `B${i}`, displayName: `B${i}`, skillLevel: 'B' as const })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `C${i}`, displayName: `C${i}`, skillLevel: 'C' as const })),
  ];
  const res = drawDelAbc(players, 42);
  assert.ok(res.ok);
  assert.equal(res.teams.length, 6);
  assert.equal(res.reserves.length, 0);
  for (const team of res.teams) assert.equal(validateAbcTeam(team), null);
});

check('5/4/3 → grootste even aantal (2), reserves met reden', () => {
  const players = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `A${i}`, displayName: `A${i}`, skillLevel: 'A' as const })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `B${i}`, displayName: `B${i}`, skillLevel: 'B' as const })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `C${i}`, displayName: `C${i}`, skillLevel: 'C' as const })),
  ];
  const res = drawDelAbc(players, 42);
  assert.ok(res.ok);
  assert.equal(res.teams.length, 2);
  assert.equal(res.reserves.length, 6);
  for (const r of res.reserves) assert.ok(r.reason.length > 5);
});

console.log('— 2 tegen 2 en Pearke —');

check('2 tegen 2: exact 2 spelers per partuur, even parturen, rest reserve', () => {
  for (const n of [4, 5, 7, 9, 13, 22]) {
    const res = drawTweeTegenTwee(makePlayers(n), n);
    assert.ok(res.ok, `N=${n}`);
    assert.equal(res.teams.length % 2, 0);
    for (const t of res.teams) assert.equal(t.players.length, 2);
    const used = res.teams.flatMap((t) => t.players.map((p) => p.id));
    assert.equal(used.length + res.reserves.length, n);
  }
});

check('Pearke: dame+heer, ontbrekende combinaties benoemd', () => {
  const players = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, displayName: `Dame ${i}`, gender: 'dame' as const })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `h${i}`, displayName: `Heer ${i}`, gender: 'heer' as const })),
  ];
  const res = drawPearke(players, 42);
  assert.ok(res.ok);
  assert.equal(res.teams.length, 3);
  for (const team of res.teams) {
    const genders = team.players.map((p) => p.gender).sort();
    assert.deepEqual(genders, ['dame', 'heer']);
  }
  assert.equal(res.reserves.length, 2);
});

console.log('— Knock-out en herkansing —');

check('winnaar doorzetten en bye-verwerking', () => {
  const teams = Array.from({ length: 6 }, (_, i) => ({ teamNo: i + 1, players: [] }));
  let { matches, byes } = generateKnockout(teams, { withConsolation: true });
  assert.equal(byes, 2);
  const m = matches.find((x) => x.key === 'M-1-1' && !x.isBye) ?? matches.find((x) => !x.isBye && x.roundNo === 1)!;
  const winner = m.red.teamNo!;
  const loser = m.white.teamNo!;
  matches = advanceWinner(matches, m.key, winner);
  const next = matches.find((x) => x.key === m.nextKey)!;
  assert.ok(next.red.teamNo === winner || next.white.teamNo === winner, 'winnaar doorgezet');
  if (m.consolationKey) {
    const cons = matches.find((x) => x.key === m.consolationKey)!;
    assert.ok(cons.red.teamNo === loser || cons.white.teamNo === loser, 'verliezer naar herkansing');
  }
});

check('rood = laagste wedstrijdnummer (opslag)', () => {
  const teams = Array.from({ length: 8 }, (_, i) => ({ teamNo: i + 1, players: [] }));
  const { matches } = generateKnockout(teams);
  for (const m of matches.filter((x) => x.roundNo === 1)) {
    assert.ok(m.red.teamNo! < m.white.teamNo!);
  }
});

check('dubbele actieve spelers hoofd/herkansing gesignaleerd', () => {
  const doubles = findDoubleActivePlayers([
    { bracket: 'main', playerIds: ['a', 'b'] },
    { bracket: 'consolation', playerIds: ['b'] },
  ]);
  assert.deepEqual(doubles, ['b']);
});

console.log('— Poules (KNKB) —');

check('poulepunten en tiebreaks', () => {
  const standing = computePouleStanding(
    [1, 2, 3],
    [
      { redTeamNo: 1, whiteTeamNo: 2, eerstenRed: 6, eerstenWhite: 4, winner: 'red' },
      { redTeamNo: 1, whiteTeamNo: 3, eerstenRed: 2, eerstenWhite: 6, winner: 'white' },
      { redTeamNo: 2, whiteTeamNo: 3, eerstenRed: 6, eerstenWhite: 5, winner: 'red' },
    ],
  );
  assert.deepEqual(standing.map((r) => r.teamNo), [3, 2, 1]);
  assert.deepEqual(standing.map((r) => r.punten), [12, 11, 9]);
});

check('round-robin: 2 poules van 4 → 12 partijen', () => {
  const teams = Array.from({ length: 8 }, (_, i) => ({ teamNo: i + 1, players: [] }));
  const res = assignPoules(teams, { pouleCount: 2 }, 7);
  assert.ok(res.ok);
  assert.equal(generatePouleSchedule(res.poules).length, 12);
});

check('KNKB-maximum 8 met club-override + motivatie', () => {
  const teams = Array.from({ length: 9 }, (_, i) => ({ teamNo: i + 1, players: [] }));
  assert.equal(assignPoules(teams, { pouleCount: 2 }, 1).ok, false);
  assert.equal(
    assignPoules(teams, { pouleCount: 2, clubOverride: true, overrideReason: 'Ledenpartij' }, 1).ok,
    true,
  );
});

console.log('— Sneker telling —');

check('3 omlopen, alle spelers per omloop, individuele scoring', () => {
  const players = makePlayers(12);
  const { ok, rounds } = drawSnekerRounds(players, 99);
  assert.ok(ok);
  assert.equal(rounds.length, 3);
  for (const round of rounds) {
    const ids = round.teams.flatMap((t) => t.players.map((p) => p.id));
    assert.equal(new Set(ids).size, 12);
  }
  const standing = computeSnekerStanding(
    ['a', 'b'],
    [{ roundNo: 1, redPlayers: ['a'], whitePlayers: ['b'], eerstenRed: 6, eerstenWhite: 4, winner: 'red' }],
  );
  assert.equal(standing[0].playerId, 'a');
  assert.equal(standing[0].punten, 7);
  assert.equal(standing[1].punten, 4);
});

console.log('— Competitiestand —');

check('sortering: voor ↓, tegen ↑, saldo ↓, deelnames ↓, naam ↑', () => {
  const base = { afwezig: 0, gespeeld: 0, gewonnen: 0, verloren: 0 };
  const rows = sortStandings([
    { playerId: 'a', displayName: 'Anna', eerstenVoor: 30, eerstenTegen: 10, deelnames: 5, ...base },
    { playerId: 'b', displayName: 'Bouke', eerstenVoor: 32, eerstenTegen: 20, deelnames: 5, ...base },
    { playerId: 'c', displayName: 'Cees', eerstenVoor: 30, eerstenTegen: 8, deelnames: 5, ...base },
    { playerId: 'd', displayName: 'Douwe', eerstenVoor: 30, eerstenTegen: 10, deelnames: 6, ...base },
    { playerId: 'e', displayName: 'Aafke', eerstenVoor: 30, eerstenTegen: 10, deelnames: 5, ...base },
  ]);
  assert.deepEqual(rows.map((r) => r.playerId), ['b', 'c', 'd', 'e', 'a']);
  assert.equal(computeSaldo(30, 12), 18);
});

console.log('— Automatische aanwezigheid —');

check('aanwezig bij uitslag, afwezig bij afronden, max 1 telling, heropenen', () => {
  const empty = new Map<string, AttendanceRecord>();
  let att = markPresentForMatch(empty, ['p1', 'p2']);
  att = markPresentForMatch(att, ['p1', 'p3']);
  assert.equal(att.size, 3);
  const final = finalizeRoundAttendance(att, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(final.get('p4')!.status, 'absent');
  const reopened = reopenRoundAttendance(final);
  assert.equal(reopened.has('p4'), false);
  assert.equal(reopened.get('p1')!.status, 'present');
});

console.log(`\nResultaat: ${passed} geslaagd, ${failed} gefaald.`);
if (failed > 0) process.exit(1);
