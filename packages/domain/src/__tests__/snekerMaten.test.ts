/**
 * Snekertelling met verschillende maten.
 *
 * Twee regels tegelijk: nooit twee gelijke maten in één partuur, en per omloop een
 * andere samenstelling.
 */

import { drawSnekerMaten, validateVerschillendeMaten } from '../toernooi/snekerMaten.ts';
import type { DrawPlayer, SkillLevel } from '../loting/types.ts';

/** n spelers per niveau, met voorspelbare namen. */
function veld(perLevel: number): DrawPlayer[] {
  const out: DrawPlayer[] = [];
  for (const level of ['A', 'B', 'C'] as SkillLevel[]) {
    for (let i = 1; i <= perLevel; i++) {
      out.push({ id: `${level}${i}`, displayName: `${level}-speler ${i}`, skillLevel: level });
    }
  }
  return out;
}

/** Niveaus binnen één partuur. */
function niveaus(players: readonly DrawPlayer[]): string[] {
  return players.map((p) => p.skillLevel ?? 'onbekend').sort();
}

describe('verschillende maten binnen een partuur', () => {
  it('geeft elk partuur precies één A, één B en één C', () => {
    const { ok, rounds } = drawSnekerMaten(veld(4), 42);
    expect(ok).toBe(true);

    for (const omloop of rounds) {
      for (const team of omloop.teams) {
        expect(niveaus(team.players)).toEqual(['A', 'B', 'C']);
      }
    }
  });

  it('zet nooit twee A-maten, twee B-maten of twee C-maten samen', () => {
    const { rounds } = drawSnekerMaten(veld(5), 7);
    for (const omloop of rounds) {
      for (const team of omloop.teams) {
        const levels = niveaus(team.players);
        expect(new Set(levels).size).toBe(levels.length);
      }
    }
  });

  it('loot drie omlopen', () => {
    const { rounds } = drawSnekerMaten(veld(4), 1);
    expect(rounds.map((r) => r.roundNo)).toEqual([1, 2, 3]);
  });

  it('gebruikt elke speler precies één keer per omloop', () => {
    const spelers = veld(4);
    const { rounds } = drawSnekerMaten(spelers, 11);
    for (const omloop of rounds) {
      const ids = omloop.teams.flatMap((t) => t.players.map((p) => p.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(4 * 3);
    }
  });
});

describe('andere samenstelling per omloop', () => {
  it('herhaalt geen enkele combinatie bij voldoende spelers', () => {
    const { rounds } = drawSnekerMaten(veld(6), 2026);

    const gezien = new Set<string>();
    let herhaald = 0;
    for (const omloop of rounds) {
      for (const team of omloop.teams) {
        const ids = team.players.map((p) => p.id).sort();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const key = `${ids[i]}|${ids[j]}`;
            if (gezien.has(key)) herhaald += 1;
            gezien.add(key);
          }
        }
      }
    }
    expect(herhaald).toBe(0);
  });

  /**
   * Telt herhaalde combinaties over alle omlopen heen.
   */
  function herhalingen(spelersPerNiveau: number): number {
    const { rounds } = drawSnekerMaten(veld(spelersPerNiveau), 777);
    const gezien = new Set<string>();
    let herhaald = 0;
    for (const omloop of rounds) {
      for (const team of omloop.teams) {
        const ids = team.players.map((p) => p.id).sort();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const key = `${ids[i]}|${ids[j]}`;
            if (gezien.has(key)) herhaald += 1;
            gezien.add(key);
          }
        }
      }
    }
    return herhaald;
  }

  // De eerste versie gebruikte een vaste C-offset van 2r. Bij een even aantal parturen
  // valt 2r terug op zichzelf: met 4 parturen zijn de offsets 0, 2, 4 ≡ 0, waardoor
  // omloop 1 en 3 elk A-C-koppel herhalen. Dat kwam pas aan het licht bij een echte
  // loting met 4 parturen — de test hierboven gebruikte er 6, waar 2r wél verschilt.
  // Vandaar deze reeks: elk aantal vanaf 3 moet herhalingsvrij zijn.
  it.each([3, 4, 5, 6, 7, 8, 9, 10])(
    'herhaalt niets bij %i parturen (ook bij een even aantal)',
    (n) => {
      expect(herhalingen(n)).toBe(0);
    },
  );

  it('meldt het eerlijk wanneer herhaling onvermijdelijk is', () => {
    // Met één partuur per omloop spelen dezelfde drie mensen elke omloop samen.
    const { rounds, messages } = drawSnekerMaten(veld(1), 5);
    expect(rounds).toHaveLength(3);
    expect(messages.some((m) => m.includes('herhaalde combinatie'))).toBe(true);
  });
});

describe('reserves', () => {
  it('zet het overschot van een niveau op de reservelijst met reden', () => {
    // 5 A, 3 B, 3 C → 3 complete parturen, 2 A-spelers over.
    const spelers = [
      ...veld(3),
      { id: 'A4', displayName: 'A-speler 4', skillLevel: 'A' as SkillLevel },
      { id: 'A5', displayName: 'A-speler 5', skillLevel: 'A' as SkillLevel },
    ];
    const { rounds, reserves } = drawSnekerMaten(spelers, 3);

    expect(rounds[0]!.teams).toHaveLength(3);
    expect(reserves).toHaveLength(2);
    expect(reserves[0]!.reason).toContain('A-spelers te veel');
  });

  it('zet spelers zonder niveau apart met een duidelijke reden', () => {
    const spelers = [...veld(2), { id: 'X', displayName: 'Zonder niveau' }];
    const { reserves } = drawSnekerMaten(spelers, 9);
    expect(reserves.map((r) => r.player.id)).toContain('X');
    expect(reserves.find((r) => r.player.id === 'X')!.reason).toContain('geen niveau');
  });

  it('weigert te loten als een heel niveau ontbreekt', () => {
    const zonderC = veld(3).filter((p) => p.skillLevel !== 'C');
    const { ok, messages } = drawSnekerMaten(zonderC, 1);
    expect(ok).toBe(false);
    expect(messages[0]).toContain('C-spelers');
  });
});

describe('reproduceerbaarheid', () => {
  it('geeft bij dezelfde seed exact dezelfde omlopen', () => {
    const a = drawSnekerMaten(veld(4), 12345);
    const b = drawSnekerMaten(veld(4), 12345);
    expect(JSON.stringify(a.rounds)).toBe(JSON.stringify(b.rounds));
  });

  it('geeft bij een andere seed een andere indeling', () => {
    const a = drawSnekerMaten(veld(4), 1);
    const b = drawSnekerMaten(veld(4), 2);
    expect(JSON.stringify(a.rounds)).not.toBe(JSON.stringify(b.rounds));
  });
});

describe('handmatige controle', () => {
  it('keurt een partuur met drie verschillende maten goed', () => {
    const teams = [
      {
        teamNo: 1,
        players: [
          { id: 'a', displayName: 'A', skillLevel: 'A' as SkillLevel },
          { id: 'b', displayName: 'B', skillLevel: 'B' as SkillLevel },
          { id: 'c', displayName: 'C', skillLevel: 'C' as SkillLevel },
        ],
      },
    ];
    expect(validateVerschillendeMaten(teams)).toEqual([]);
  });

  it('waarschuwt in het Nederlands bij twee gelijke maten', () => {
    const teams = [
      {
        teamNo: 2,
        players: [
          { id: 'a1', displayName: 'A1', skillLevel: 'A' as SkillLevel },
          { id: 'a2', displayName: 'A2', skillLevel: 'A' as SkillLevel },
          { id: 'c', displayName: 'C', skillLevel: 'C' as SkillLevel },
        ],
      },
    ];
    const problems = validateVerschillendeMaten(teams);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('2 A-maten samen');
  });
});
