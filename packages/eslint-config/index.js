import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Base configuration shared by every workspace. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Without this every `process`, `console` and `URL` reads as an undefined
      // variable. The domain package needs none of them, but declaring it here costs
      // nothing and spares each workspace repeating it.
      globals: { ...globals.node, ...globals.es2023 },
    },
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
