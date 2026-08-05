# Sentry Hackweek

Hackweek is an internal React + TypeScript application served by one Hono Cloudflare Worker. Application-owned Google OAuth authenticates users, D1 owns sessions/data/roles, private R2 stores attachments, and Cloudflare Stream handles resumable demo-video ingest and protected playback. The UI preserves the Sentry `#HACKWEEK` identity and archive hierarchy.

## Requirements

- Node.js 24.11 or newer (Volta and CI pin 24.19)
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

Open `http://localhost:5173`. `AUTH_MODE=local` is an explicit fixed identity accepted only when `APP_ORIGIN` and the request URL are the same exact loopback origin. It never accepts client roles; D1 remains the sole role authority. To promote the disposable local row after opening the app once:

```bash
npx wrangler d1 execute hackweek-db --local --command \
  "UPDATE users SET is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE source_uid = 'local-browser-user' AND email = 'developer@sentry.io'"
npm run dev
```

Resetting `.wrangler/state` removes the promotion. Never run that command with `--remote`.

## Authentication

- `google` — deployed application-owned Google OAuth Authorization Code flow with PKCE, state, nonce, confidential server exchange, Google JWKS validation, exact verified `@sentry.io` enforcement, hashed opaque D1 sessions, and secure HttpOnly cookies.
- `local` — explicit loopback-only development identity; no Google secrets or network resources required.

All browser APIs except health, the signed Stream webhook, and service-token video jobs require a D1-backed user. Authenticated mutations and logout require an exact same-origin `Origin` header. Logout revokes the current D1 session. Login rotates existing sessions. Google/client claims never grant admin access.

See [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md) for exact Google Cloud Console origins/callbacks, `GOOGLE_CLIENT_SECRET` installation, single-environment Cloudflare setup, and secret boundaries.

## Quality gates

```bash
npm run verify
```

This generates binding types, typechecks, checks formatting/lint, runs Worker/frontend/migration/player tests, builds, performs a credential-free deployment dry run, and runs an isolated seeded D1/R2/fake-Stream journey. Local fakes do not prove real Google OAuth or Stream integration; follow [`docs/cloudflare-validation.md`](docs/cloudflare-validation.md) for the remote evidence gate.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system/data/security boundaries
- [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md) — one Cloudflare environment and Google OAuth setup
- [`docs/cloudflare-validation.md`](docs/cloudflare-validation.md) — pre-cutover remote validation
- [`docs/migration.md`](docs/migration.md) — export/import/reconciliation
- [`docs/video-operations.md`](docs/video-operations.md) — Stream lifecycle, jobs, and archive
- [`docs/screening.md`](docs/screening.md) — screening controls and rehearsal
- [`docs/cutover.md`](docs/cutover.md) — manual DNS cutover and rollback
