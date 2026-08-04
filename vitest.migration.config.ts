import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/migration/**/*.test.ts', 'test/e2e/**/*.test.ts'],
    environment: 'node',
  },
});
