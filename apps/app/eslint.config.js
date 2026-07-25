import base from '@kv/eslint-config';

/**
 * App lint rules.
 *
 * Enforces two conventions from CLAUDE.md that are otherwise only review habits:
 * screens must not hard-code colours (rule 12), and they must not import the API's
 * server-side modules.
 */
export default [
  ...base,
  {
    files: ['app/**/*.tsx', 'src/**/*.tsx', 'src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'fastify', '@node-rs/*', 'jose'],
              message:
                'Server-only modules must never reach the client bundle. Call the API instead.',
            },
          ],
        },
      ],
      // Screens compose; they do not invent colours. Hard-coded hex is what made the
      // v1 palette impossible to change in one place. See CLAUDE.md rule 12.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            'No hard-coded colours in screens — import from src/theme/tokens.ts. See CLAUDE.md rule 12.',
        },
      ],
    },
  },
  {
    // The token and typography files are where colour literals are supposed to live.
    files: ['src/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    ignores: ['.expo/**', 'expo-env.d.ts', 'node_modules/**'],
  },
];
