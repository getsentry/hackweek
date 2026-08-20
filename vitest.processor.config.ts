import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/processor/**/*.test.ts'],
    fileParallelism: false,
  },
});
