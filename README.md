# Sentry Hackweek

Hackweek is an internal React + TypeScript application served by one Hono Cloudflare Worker. Application-owned Google OAuth authenticates users, D1 owns sessions/data/roles, and private R2 stores attachments plus immutable video originals and canonical MP4 derivatives. Project videos are processed by a Cloudflare Workflow using the pinned FFmpeg Container in `Dockerfile.video-processor`; ready media is served only through authenticated same-origin range endpoints.

## Requirements

- Node.js 24.11 or newer (Volta and CI pin 24.19)
- npm 11 or newer
- Docker with a running Linux engine (Docker Desktop or OrbStack)
- `ffmpeg` and `ffprobe` 8.x on the host for generated local fixtures

No Cloudflare video resource or credential is required for local development.

## Local video environment

Complete the one-time setup without replacing an existing `.dev.vars`:

```bash
npm ci
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run migrate:local -- \
  --database test/fixtures/firebase/database.json \
  --storage-manifest test/fixtures/firebase/storage-manifest.json \
  --storage-root test/fixtures/firebase/storage
```

Configure the Google OAuth Web application in `.dev.vars` for JavaScript origin `http://localhost:5173` and redirect URI `http://localhost:5173/api/auth/callback`. Use the shared-vault client secret; never commit `.dev.vars`.

Then one command starts the application, local D1/R2, local Workflow, and the real pinned FFmpeg Container:

```bash
npm run dev:video
```

Open `http://localhost:5173`, sign in, and use a current project’s video panel. Uploading a video performs real multipart local-R2 upload and Workflow/Container processing. When the status becomes ready, verify project playback, then save the project in the admin screening order and open the year reel. Originals and derivatives remain private and are retained after video retirement.

To promote a local user after signing in once, replace the email below and run:

```bash
npx wrangler d1 execute hackweek-db --local --command \
  "UPDATE users SET is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE google_subject IS NOT NULL AND email = 'you@sentry.io'"
```

Never run that command with `--remote`.

### Troubleshooting

- **Container does not start:** run `docker version` and `npm run video:processor:build`. Both client and server must be available.
- **Upload remains queued:** keep `npm run dev:video` running and inspect its Workflow step output. Local processing concurrency is intentionally one.
- **OAuth callback fails:** ensure `APP_ORIGIN`, the Google allowed origin, and `GOOGLE_REDIRECT_URI` all use `http://localhost:5173` exactly.
- **Stale local data:** stop the app and remove only `.wrangler/state`, then repeat the local migrations. This never touches remote resources.
- **Playback fails:** confirm the video is ready and signed-in playback returns `200` or `206`; unready, retired, and anonymous reads are intentionally rejected.

## Authentication

Google OAuth is the only browser authentication path. It uses Authorization Code with PKCE, state and nonce validation, Google JWKS verification, exact verified `@sentry.io` enforcement, hashed opaque D1 sessions, and HttpOnly cookies. D1 is the sole role authority. Authenticated mutations require the exact same-origin `Origin` header.

## Quality gates

```bash
npm run verify
npm audit --omit=dev --audit-level=high
```

The gate generates binding types, typechecks, checks formatting/lint, runs the standard test suites, builds, and performs a credential-free production dry run. It does not deploy, provision, access remote resources, or prove real Google OAuth.
