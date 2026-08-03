import {cloudflare} from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite-plus';

export default defineConfig({
  plugins: [react(), cloudflare()],
  fmt: {
    ignorePatterns: [
      '.vscode/**',
      'build/**',
      'dist/**',
      'firebase.json',
      'node_modules/**',
      'src/assets/**',
      'src/components/**',
      'src/pages/**',
      'src/*.js',
      'src/*.css',
      'src/*.svg',
      'worker-configuration.d.ts',
    ],
    bracketSpacing: false,
    printWidth: 90,
    semi: true,
    singleQuote: true,
  },
  lint: {
    ignorePatterns: ['build/**', 'dist/**', 'node_modules/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
