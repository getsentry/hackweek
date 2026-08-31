import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: [
      'test/app/**/*.test.ts',
      'test/app/**/*.test.tsx',
      'test/player/**/*.test.ts',
      'test/player/**/*.test.tsx',
      'test/video-ui/**/*.test.tsx',
    ],
    setupFiles: ['./test/app/setup.ts'],
  },
});
