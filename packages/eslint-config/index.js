import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Base configuration shared by every workspace. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Only complain when *every* binding in a destructuring could be const.
      // `let { matches, byes } = generateKnockout(...)` reassigns matches but not byes,
      // and a declaration cannot be split into const and let halves.
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    ignores: ['dist/**', 'build/**', '.expo/**', 'node_modules/**', 'coverage/**'],
  },
);
