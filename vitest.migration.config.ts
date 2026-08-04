import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/migration/**/*.test.ts'],
    environment: 'node',
  },
});
