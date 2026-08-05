# Foundation toolchain decision

## Decision

The Cloudflare application uses Vite+ 0.2.7 as its local toolchain, backed by Vite
8.2.0 and the official `@cloudflare/vite-plugin` 1.50.0. It remains a single
React SPA and Hono Worker; the Worker serves `/api/*` while Workers Static Assets
serves the SPA. D1 and R2 are local bindings until a later Cloudflare environment task provisions
remote resources.

## Compatibility spike

The spike was run on 2026-08-03 with Node 24.19.0 and npm 11.17.0 in a clean
temporary project, without package overrides or patches.

- `vp build` produced both `dist/client` and a Worker bundle containing the
  generated deployment configuration.
- `vp dev --host 127.0.0.1` started the official Cloudflare Vite integration;
  requests to `/api/health` returned `{"ok":true}` from `workerd`, and `/`
  served the Vite client.
- `vp test run --config vitest.config.ts` ran a Worker integration test through
  `@cloudflare/vitest-pool-workers`. The test applied a D1 migration, queried D1,
  and read/wrote the configured R2 bucket.
- `npm ls vite vite-plus @cloudflare/vite-plugin wrangler` resolved one Vite
  8.2.0 installation. The Cloudflare plugin's declared Vite 8 and Wrangler
  requirements were satisfied directly.

Because development, tests, production build, and Worker/binding integration all
worked through supported public configuration, Vite+ was retained. If a future
upgrade breaks that support, use current Vite and the same official Cloudflare
plugin rather than adding overrides or compatibility patches.

## Local commands

```bash
npm install
npm run cf-typegen
npm run db:migrate:local
npm run dev
```

Quality gates:

```bash
npm run typecheck
npm run format:check
npm run lint
npm test
npm run build
```

Local Wrangler state is stored under `.wrangler/`. No Cloudflare account or
remote D1/R2 resource is required for these commands.
