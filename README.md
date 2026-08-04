# Sentry Hackweek

The Hackweek application is migrating to a Cloudflare-native modular monolith:
a React + TypeScript SPA and one Hono Worker backed by D1 and R2.

## Requirements

- Node.js 24.11 or newer
- npm 11 or newer

## Local development

Install dependencies, configure the loopback-only browser identity, reset disposable
local state, import the synthetic historical fixture, and start the app:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run cf-typegen
rm -rf .wrangler/state
npm run db:migrate:local
npm run migrate:local -- \
  --database test/fixtures/firebase/database.json \
  --storage-manifest test/fixtures/firebase/storage-manifest.json \
  --storage-root test/fixtures/firebase/storage
npm run dev
```

Open `http://localhost:5173`. The first `/api/session` request creates the configured
identity as a D1 **member**. The official Cloudflare Vite plugin runs the API Worker in
`workerd` and serves the SPA with Workers Static Assets. Local D1 and R2 data live under
`.wrangler/`; no remote Cloudflare resources are required. The health endpoint is
`http://localhost:5173/api/health`.

`AUTH_MODE=local` is explicit and accepts requests only when their URL hostname is
`localhost`, `127.0.0.1`, or `::1`. It rejects LAN/public hostnames, missing identity
values, non-company email domains, Access settings, and signed-key settings. Do not put
roles or credentials in `.dev.vars`: request headers, cookies, query parameters, and JWTs
cannot change the configured local identity or its role. Changing `.dev.vars` requires
restarting `npm run dev`.

D1 is the only role authority. To promote the configured identity in disposable local D1,
first open the app once so the user exists, stop the dev server, then run:

```bash
npx wrangler d1 execute hackweek-db --local --command \
  "UPDATE users SET is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE access_subject = 'local-browser-user' AND email = 'developer@sentry.io'"
npm run dev
```

Refresh the browser; `/api/session` will now return the D1-backed `admin` role. Resetting
`.wrangler/state` removes this promotion. If you change the example subject or email,
change both predicates in the SQL command to match. Never use this local command against a
remote database.

The SPA provides year archives, project and idea browsing, project/team editing,
administrator group controls, and private project attachments. See
[`docs/architecture/projects.md`](docs/architecture/projects.md) for the intentional legacy
behavior and R2 key/access model, and [`docs/migration.md`](docs/migration.md) for full
migration rehearsal and reconciliation instructions.

### Authentication modes

All APIs except `/api/health` pass through one explicitly selected authentication mode:

- `access` — required for staging/production. It verifies a Cloudflare Access application
  JWT from `Cf-Access-Jwt-Assertion` using `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and
  `ALLOWED_EMAIL_DOMAIN`. Local identity and key-set variables are rejected.
- `local` — browser development only, configured by ignored `.dev.vars` as shown above.
  It requires a complete fixed identity and a loopback request URL; it is never selected
  because Access configuration is absent.
- `local-signed` — signed fixture testing only. It still requires a valid RS256 JWT,
  Access-style issuer/audience settings, and an explicit public JWKS. The deterministic
  private test key stays under `test/auth/` and is not part of browser setup.

The Access verifier checks signature, issuer, audience, time claims, application token
type, subject, and exact company email domain. Unknown modes and contradictory or missing
configuration fail closed. D1, not Access claims or frontend state, owns administrator
roles.

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
