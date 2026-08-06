# Cloudflare and Google OAuth setup

This operator guide configures exactly one Cloudflare environment in the Sentry Enterprise account (`773afa1f62ff86c80db4f24f7ff1e9c8`). That environment is validated before DNS cutover and remains the production environment afterward. Resource creation, secrets, deployment, import, and DNS are human-controlled; never put real credentials in Git or chat.

## Google Cloud Console

Use an OAuth 2.0 client whose application type is **Web application**. Configure its consent/branding for the Sentry organization. The authorization flow requests only `openid email profile` and does not request offline access.

In **Authorized JavaScript origins**, enter the exact deployed origin with no path or wildcard:

```text
https://hackweek.getsentry.workers.dev
```

Loopback origins may remain only if this same client is intentionally used for local development.

In **Authorized redirect URIs**, enter the exact deployed callback:

```text
https://hackweek.getsentry.workers.dev/api/auth/callback
```

Scheme, host, port, path, case, and trailing slash must match exactly. Google permits HTTP only for loopback development. Do not add wildcard origins, wildcard callbacks, query strings, or an open redirect.

Set reviewed non-secret Worker vars in `wrangler.production.json`:

```text
AUTH_MODE=google
APP_ORIGIN=https://hackweek.getsentry.workers.dev
GOOGLE_REDIRECT_URI=https://hackweek.getsentry.workers.dev/api/auth/callback
GOOGLE_CLIENT_ID=<web-application-client-id>.apps.googleusercontent.com
ALLOWED_EMAIL_DOMAIN=sentry.io
STREAM_MODE=disabled
```

Install the client secret interactively; do not place it in config, GitHub workflow YAML, shell history, logs, or client output:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.production.json
```

The Worker uses Google's authorization-code endpoint, PKCE S256, random state/nonce, server-side exchange, and Google JWKS ID-token validation. It checks signature, issuer, client audience, expiry, nonce, `email_verified=true`, and the exact email suffix `@sentry.io`. No `hd` value is relied upon; the verified email address itself is the domain boundary. D1 remains the only application role authority.

## Cloudflare resources

Create one Worker with Static Assets, one D1 database, and one private R2 attachment bucket in the Sentry Enterprise account. The core rollout leaves `STREAM_MODE=disabled` and does not create or mutate Stream resources or webhooks. Replace the remaining D1 UUID and Google client ID placeholders in `wrangler.production.json` through a reviewed change. The deployment workflow rejects placeholders, fake/real Stream mode, and an unexpected account ID.

Apply migrations only to the reviewed destination:

```bash
npx wrangler d1 migrations apply hackweek-db \
  --remote --config wrangler.production.json --yes
```

D1 stores short-lived single-use OAuth attempts, Google subjects, roles, and only SHA-256 hashes of opaque eight-hour session tokens. Session cookies are `HttpOnly; Secure; SameSite=Lax; Path=/`. Authentication codes, Google tokens, client secrets, state/verifiers, ID tokens, and raw session tokens must not be logged or persisted.

## Stream and service secrets

Set the non-secret real Stream/R2 values in `wrangler.production.json`. Enter secrets interactively:

```bash
npx wrangler secret put STREAM_API_TOKEN --config wrangler.production.json
npx wrangler secret put STREAM_WEBHOOK_SECRET --config wrangler.production.json
npx wrangler secret put VIDEO_SERVICE_TOKEN --config wrangler.production.json
npx wrangler secret put R2_ACCESS_KEY_ID --config wrangler.production.json
npx wrangler secret put R2_SECRET_ACCESS_KEY --config wrangler.production.json
```

Service-token video jobs and the signed Stream webhook are deliberately outside browser sessions. R2 S3 credentials are needed only for explicitly selected historical promotion; ordinary private attachment reads use the binding.

## Deployment

Configure the protected GitHub environment `hackweek-cloudflare` with reviewers plus `CLOUDFLARE_API_TOKEN` and the exact `CLOUDFLARE_ACCOUNT_ID`. Run **Deploy Cloudflare environment**, type `deploy-hackweek`, and record non-secret deployment evidence. The workflow verifies, migrates, and deploys; it does not create resources, install Worker secrets, register Stream webhooks, import data, or change DNS.

Follow [`cloudflare-validation.md`](cloudflare-validation.md) before cutover.
