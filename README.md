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

The health endpoint is available at `http://localhost:5173/api/health`. The authenticated
SPA provides year archives, project and idea browsing, project/team editing, administrator
group controls, and private project attachments. See
[`docs/architecture/projects.md`](docs/architecture/projects.md) for the intentional legacy
behavior and R2 key/access model.

### Cloudflare Access

All APIs except `/api/health` require a Worker-validated Cloudflare Access application
JWT from `Cf-Access-Jwt-Assertion`. Production/staging must explicitly configure:

- `AUTH_MODE=access`
- `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `ACCESS_AUD=<application audience tag>`
- `ALLOWED_EMAIL_DOMAIN=sentry.io`

The Worker fetches the account JWKS from the team domain and verifies the RS256
signature, issuer, audience, time claims, application token type, subject, and company
email domain. D1, not Access claims or frontend state, owns administrator roles.

For local development, copy `.dev.vars.example` to `.dev.vars`. Local mode accepts only
signed fixture JWTs matching the explicit checked-in public key; it never trusts identity
headers and cannot activate merely because production configuration is absent. Keep the
matching development private key outside Worker configuration. Tests own a deterministic
private signing fixture under `test/auth/`.

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
