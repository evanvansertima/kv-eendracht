import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Jest-compatible globals so the ported suites run unchanged.
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
