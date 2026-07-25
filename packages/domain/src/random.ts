/**
 * Seedbare, reproduceerbare randomgenerator (mulberry32) + Fisher-Yates.
 * Alle loting in de app loopt via deze module (CLAUDE.md regel 6):
 * de seed wordt bij publicatie opgeslagen zodat elke loting reproduceerbaar is.
 */

export type Rng = () => number;

/** mulberry32 — snelle, goed verdeelde 32-bit PRNG. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nieuwe willekeurige seed (voor "opnieuw loten"). */
export function newSeed(): number {
  return Math.floor(Date.now() % 2147483647) ^ Math.floor(Math.random() * 0x7fffffff);
}

/** Onbevooroordeelde Fisher-Yates-shuffle; muteert de input niet. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Geheel getal in [0, maxExclusive). */
export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}
