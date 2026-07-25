/**
 * @kv/domain — pure kaatsen logic shared by the API and the app.
 *
 * Nothing here may import React, React Native, Expo or any backend client, and nothing
 * may call Math.random(): draws must stay reproducible from a stored seed.
 * Both rules are enforced by ESLint. See docs/Decisions/ADR-0004-pnpm-monorepo.md.
 */
export * from './loting/index.ts';
export * from './toernooi/index.ts';
export * from './competitie/index.ts';
export type { Rng } from './random.ts';
export { createRng, newSeed, shuffle, randomInt } from './random.ts';
