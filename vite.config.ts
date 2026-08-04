import {cloudflare} from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite-plus';

const localStatePath = process.env.HACKWEEK_LOCAL_STATE_PATH;
const localConfigPath = process.env.HACKWEEK_WRANGLER_CONFIG;

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      configPath: localConfigPath,
      persistState: localStatePath ? {path: localStatePath} : true,
    }),
  ],
  fmt: {
    ignorePatterns: [
      '.vscode/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'src/assets/**',
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
