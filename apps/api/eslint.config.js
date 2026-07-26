import base from '@kv/eslint-config';

/**
 * API lint rules.
 *
 * The restricted-import rule here guards the one mistake that would silently disable
 * every RLS policy in the system: reaching for a raw pool instead of withRls, so a query
 * runs without the request's JWT claims applied. See ADR-0003.
 */
export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pg',
              importNames: ['Pool', 'Client'],
              message:
                'Do not construct a pool or client directly. Use withRls() from src/db.ts so ' +
                'every query carries the request claims and RLS applies. See ADR-0003.',
            },
          ],
        },
      ],
      // The API logs through Pino (app.log / req.log), which is structured and level
      // aware. A bare console.log bypasses both and is invisible in production.
      'no-console': 'error',
    },
  },
  {
    // db.ts is the one module allowed to build the pool — it is what everything else
    // must go through.
    files: ['src/db.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The RLS suite must build its own client: its whole purpose is to connect as
    // kv_api, set arbitrary claims, and assert that the DATABASE refuses — with
    // withRls and the route guards bypassed. Routing it through withRls would test
    // the helper rather than the policies.
    //
    // console is allowed too: the suite warns when no database is reachable, which is
    // what separates "skipped" from "silently passed".
    files: ['src/__tests__/**'],
    rules: { 'no-restricted-imports': 'off', 'no-console': 'off' },
  },
  {
    // db.mjs is a command-line migration runner. console IS its user interface here,
    // not stray debugging left behind.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: ['src/db/migrations/**', 'node_modules/**'],
  },
];
