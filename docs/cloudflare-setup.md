# Cloudflare and Google OAuth setup

This operator guide configures exactly one Cloudflare environment in the Sentry Enterprise account (`773afa1f62ff86c80db4f24f7ff1e9c8`). Its canonical production origin is `https://hackweek.getsentry.workers.dev`; the same environment is validated before traffic handoff and remains production afterward. Resource creation, secrets, deployment, import, and traffic handoff are human-controlled. Never put real credentials in Git or chat.

## Google Cloud Console

Use an OAuth 2.0 client whose application type is **Web application**. Configure its consent/branding for the Sentry organization. The authorization flow requests only `openid email profile` and does not request offline access.

In **Authorized JavaScript origins**, enter the exact deployed origin with no path or wildcard:

```text
https://hackweek.getsentry.workers.dev
```

Add each loopback origin used for local development to the dedicated development OAuth client.

In **Authorized redirect URIs**, enter the exact deployed callback:

```text
https://hackweek.getsentry.workers.dev/api/auth/callback
```

Scheme, host, port, path, case, and trailing slash must match exactly. Google permits HTTP only for loopback development. Do not add wildcard origins, wildcard callbacks, query strings, or an open redirect.

Set reviewed non-secret Worker vars in `wrangler.production.json`:

```text
APP_ORIGIN=https://hackweek.getsentry.workers.dev
GOOGLE_REDIRECT_URI=https://hackweek.getsentry.workers.dev/api/auth/callback
GOOGLE_CLIENT_ID=694837489680-25m2umkr51lofdads5uvocgtcdqcs6c4.apps.googleusercontent.com
ALLOWED_EMAIL_DOMAIN=sentry.io
STREAM_MODE=disabled
```

Install the client secret interactively; do not place it in config, GitHub workflow YAML, shell history, logs, or client output:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.production.json
```

The Worker uses Google's authorization-code endpoint, PKCE S256, random state/nonce, server-side exchange, and Google JWKS ID-token validation. It checks signature, issuer, client audience, expiry, nonce, `email_verified=true`, and the exact email suffix `@sentry.io`. No `hd` value is relied upon; the verified email address itself is the domain boundary. D1 remains the only application role authority.

## Local development

Create a Google OAuth Web application that allows the JavaScript origin `http://localhost:5173` and the exact redirect URI `http://localhost:5173/api/auth/callback`. Copy `.dev.vars.example` to `.dev.vars`, fill in the client ID, and retrieve the client secret from the shared vault. Never commit `.dev.vars` or the secret.

Google OAuth is also required locally; there is no fixed development identity or authentication bypass. If a different loopback host or port is used, update the authorized origin, redirect URI, `APP_ORIGIN`, and `GOOGLE_REDIRECT_URI` so they match exactly.

## Cloudflare resources

Create one Worker with Static Assets, one D1 database, and one private R2 attachment bucket in the Sentry Enterprise account. The reviewed `wrangler.production.json` contains the production D1 UUID, Google client ID, exact origin/callback, and `STREAM_MODE=disabled`. The deployment workflow rejects placeholders, fake/real Stream mode, and an unexpected account ID.

The core rollout needs no Cloudflare Stream resource or webhook, Stream API/webhook secret, video-service secret, R2 S3 access key, or video configuration. The private attachment bucket is accessed through its Worker binding. All real-Stream and historical-video promotion setup is deferred to a separately approved rollout under [`video-operations.md`](video-operations.md).

Apply migrations only to the reviewed destination:

```bash
npx wrangler d1 migrations apply hackweek-db \
  --remote --config wrangler.production.json --yes
```

D1 stores short-lived single-use OAuth attempts, Google subjects, roles, and only SHA-256 hashes of opaque eight-hour session tokens. Session cookies are `HttpOnly; Secure; SameSite=Lax; Path=/`. Authentication codes, Google tokens, client secrets, state/verifiers, ID tokens, and raw session tokens must not be logged or persisted.

## Deployment

Configure the protected GitHub environment `hackweek-cloudflare` with reviewers plus `CLOUDFLARE_API_TOKEN` and the exact `CLOUDFLARE_ACCOUNT_ID`. Run **Deploy Cloudflare environment**, type `deploy-hackweek`, and record non-secret deployment evidence. The workflow verifies, applies D1 migrations, and deploys the Worker and Static Assets; it does not create resources, install Worker secrets, import source data, or perform the traffic handoff.

Follow [`cloudflare-validation.md`](cloudflare-validation.md) before cutover.
