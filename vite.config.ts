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
      '.agent/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.continue/**',
      '.cursor/**',
      '.gemini/**',
      '.opencode/**',
      '.pi/**',
      '.roo/**',
      '.superconductor/**',
      '.vscode/**',
      '.windsurf/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'src/assets/**',
      'tools/oxlint/anti-slop/**',
      'worker-configuration.d.ts',
    ],
    bracketSpacing: false,
    printWidth: 90,
    semi: true,
    singleQuote: true,
  },
  lint: {
    ignorePatterns: [
      '.agent/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.continue/**',
      '.cursor/**',
      '.gemini/**',
      '.opencode/**',
      '.pi/**',
      '.roo/**',
      '.superconductor/**',
      '.windsurf/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'tools/oxlint/anti-slop/**',
    ],
    jsPlugins: [{name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts'}],
    rules: {
      'anti-slop/no-chained-type-assertions': 'error',
      'anti-slop/no-conditional-empty-object-spread': 'error',
      'anti-slop/no-known-value-widening': 'error',
      'anti-slop/no-module-mocking': 'error',
      'anti-slop/no-object-parameters': 'error',
      'anti-slop/no-reflect-apply': 'error',
      'anti-slop/no-reflect-get': 'error',
      'anti-slop/no-runtime-typeof': 'error',
      'anti-slop/no-shape-in-symbol-names': 'error',
      'anti-slop/no-unknown-parameters': 'error',
      'anti-slop/no-unknown-returns': 'error',
      'anti-slop/no-unknown-type-aliases': 'error',
      'anti-slop/no-unsafe-dictionary-type': 'error',
      'anti-slop/no-widen-then-assert': 'error',
      'anti-slop/require-safety-comment-for-type-assertion': 'error',
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
