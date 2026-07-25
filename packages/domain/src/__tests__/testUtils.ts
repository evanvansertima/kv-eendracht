import type { DrawPlayer, SkillLevel, Gender } from '../loting/types.ts';

export function makePlayers(n: number): DrawPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i + 1).padStart(3, '0')}`,
    displayName: `Speler ${i + 1}`,
  }));
}

export function makeAbcPlayers(a: number, b: number, c: number): DrawPlayer[] {
  const players: DrawPlayer[] = [];
  const push = (count: number, level: SkillLevel) => {
    for (let i = 0; i < count; i++) {
      players.push({
        id: `${level}${String(i + 1).padStart(3, '0')}`,
        displayName: `${level}-speler ${i + 1}`,
        skillLevel: level,
      });
    }
  };
  push(a, 'A');
  push(b, 'B');
  push(c, 'C');
  return players;
}

export function makeGenderPlayers(dames: number, heren: number): DrawPlayer[] {
  const players: DrawPlayer[] = [];
  const push = (count: number, gender: Gender) => {
    for (let i = 0; i < count; i++) {
      players.push({
        id: `${gender}${String(i + 1).padStart(3, '0')}`,
        displayName: `${gender} ${i + 1}`,
        gender,
      });
    }
  };
  push(dames, 'dame');
  push(heren, 'heer');
  return players;
}
