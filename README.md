# Sentry Hackweek

The Hackweek application is migrating to a Cloudflare-native modular monolith:
a React + TypeScript SPA and one Hono Worker backed by D1 and R2.

## Requirements

- Node.js 24.11 or newer
- npm 11 or newer

## Local development

```bash
npm install
npm run cf-typegen
npm run db:migrate:local
npm run dev
```

The official Cloudflare Vite plugin runs the API Worker in `workerd` and serves
the SPA with Workers Static Assets. Local D1 and R2 data live under `.wrangler/`;
no remote Cloudflare resources are required.

The health endpoint is available at `http://localhost:5173/api/health`.

## Quality gates

```bash
npm run typecheck
npm run format:check
npm run lint
npm test
npm run build
```

See [`docs/architecture/toolchain.md`](docs/architecture/toolchain.md) for the
Vite+ compatibility evidence and selected toolchain.
