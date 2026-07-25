import base from './index.js';

/**
 * Purity rules for @kv/domain.
 *
 * These enforce rules 1 and 2 of CLAUDE.md mechanically rather than by review:
 * the domain layer must stay framework-free and deterministic. Both are load-bearing —
 * the layer is imported by the API *and* the app, and every draw must be reproducible
 * from its stored seed.
 */
export default [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'react-native',
                'react-native/*',
                'expo',
                'expo-*',
                '@expo/*',
                '@react-native*',
                '@tanstack/*',
                'zustand',
                '@nestjs/*',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                'fastify',
              ],
              message:
                'Domain logic must stay pure: no React, React Native, Expo, or backend imports. See CLAUDE.md rule 1.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Use createRng(seed) from ./random.ts. Unseeded randomness makes draws irreproducible and the stored draw_seed a lie. See CLAUDE.md rule 2.',
        },
      ],
    },
  },
  {
    // random.ts is the one place allowed to reach for real entropy, and only to mint
    // a fresh seed for "opnieuw loten" — never inside a draw itself.
    files: ['src/random.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['verify.ts', 'src/__tests__/**'],
    rules: { 'no-console': 'off' },
  },
];
