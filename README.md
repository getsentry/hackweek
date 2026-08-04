# Sentry Hackweek

Hackweek is an internal React + TypeScript application served by one Hono Cloudflare Worker. Cloudflare Access authenticates users, D1 owns application data and roles, private R2 stores attachments, and Cloudflare Stream handles direct resumable demo-video ingest and protected playback. The UI preserves the recognizable Sentry `#HACKWEEK` identity and archive hierarchy.

## Requirements

- Node.js 24.11 or newer (the repository pins 24.19 through Volta and CI)
- npm 11 or newer

## Deterministic local start

```bash
npm ci
cp .dev.vars.example .dev.vars
rm -rf .wrangler/state
npm run db:migrate:local
npm run migrate:local -- \
  --database test/fixtures/firebase/database.json \
  --storage-manifest test/fixtures/firebase/storage-manifest.json \
  --storage-root test/fixtures/firebase/storage
npm run dev
```

Open `http://localhost:5173`. The fixture is synthetic; it seeds the 2024 archive, `Historical Telescope`, `Idea Compass`, an attachment, a ballot, and an award. The official Cloudflare Vite plugin runs the API in workerd and serves Workers Static Assets. D1/R2 state remains under ignored `.wrangler/`; no account or remote credential is needed.

`AUTH_MODE=local` accepts only exact loopback URLs and the fixed `.dev.vars` identity. It rejects LAN/public hosts, client-provided roles, Access variables, signed-key variables, and non-company email domains. The first `/api/session` request creates a **member**. To test RBAC, open the app once, stop the server, promote only the disposable local row, and restart:

```bash
npx wrangler d1 execute hackweek-db --local --command \
  "UPDATE users SET is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE access_subject = 'local-browser-user' AND email = 'developer@sentry.io'"
npm run dev
```

Resetting `.wrangler/state` removes the promotion. Never run that command with `--remote`.

## Local readiness and quality gates

```bash
npm run verify
```

`verify` generates deterministic binding types, typechecks, formats, lints, runs Worker/frontend/migration/player tests, builds the Worker and SPA, then performs an isolated seeded local readiness journey. The journey uses temporary D1/R2 state and proves member/admin RBAC, archives, migrated team/media, voting/admin analytics, migration reconciliation, fake tus provisioning, ready-only screening order, and the fake-playback boundary. It deletes its state afterward.

Local fake Stream does **not** accept video bytes, transcode, create HLS, prove Access, or prove Stream. Real Access/Stream/R2 bindings require the separately approved staging gate in [`docs/staging.md`](docs/staging.md).

Useful focused commands:

```bash
npm run typecheck
npm run format:check
npm run lint
npm test
npm run build
npm run test:readiness
```

## Authentication modes

- `access` — staging/production only. Verifies Cloudflare Access RS256 JWT signature, issuer, audience, time, application token type, subject, and exact company domain.
- `local` — explicit loopback-only development identity; D1 remains the sole role authority.
- `local-signed` — deterministic RS256 test fixtures only.

Unknown, missing, or contradictory configuration fails closed. All APIs except `/api/health`, the authenticated Stream webhook, and service-token video job routes pass through the shared identity boundary.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system boundaries, data model, security, and legacy feature inventory
- [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md) — Access, Worker, D1, R2, Stream, bindings, and secrets
- [`docs/migration.md`](docs/migration.md) — export validation, dry runs, import, reconciliation, and rehearsals
- [`docs/video-operations.md`](docs/video-operations.md) — direct uploads, lifecycle, loudness, protected playback, and Drive archive
- [`docs/screening.md`](docs/screening.md) — screening controls, state, browser/Meet checks, and failure handling
- [`docs/staging.md`](docs/staging.md) — manual staging gate and evidence checklist
- [`docs/cutover.md`](docs/cutover.md) — operator-assisted production cutover, rollback, and decommission follow-up
