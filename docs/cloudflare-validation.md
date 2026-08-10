# Core Cloudflare pre-cutover validation

This is the go/no-go gate for the production environment at `https://hackweek.getsentry.workers.dev`. It covers the core D1, private R2, Google OAuth, and Static Assets rollout with `STREAM_MODE=disabled`. Real Stream, tus/HLS, screening, measurement, and archive checks are excluded; [`video-operations.md`](video-operations.md) defines the separate deferred rollout.

Record only non-secret request IDs/statuses, timestamps, the release SHA, and pass/fail outcomes. Never record authorization codes, Google tokens, client secrets, state/verifier/nonce values, ID tokens, cookies, or raw session tokens.

## Entry and deployment

- [ ] `npm run verify` passes from a clean checkout at the exact release SHA.
- [ ] [`cloudflare-setup.md`](cloudflare-setup.md) is reviewed and the protected deployment workflow succeeds for the intended account and SHA.
- [ ] D1 migrations are applied; the deployed Worker has the reviewed D1, private R2, and Static Assets bindings.
- [ ] `APP_ORIGIN` is exactly `https://hackweek.getsentry.workers.dev`, the Google callback is exactly `https://hackweek.getsentry.workers.dev/api/auth/callback`, and `STREAM_MODE=disabled` is confirmed in deployed production configuration.
- [ ] The final production source import is still pending and reserved for the write-frozen procedure in [`cutover.md`](cutover.md).

## Google OAuth and authorization

- [ ] An unauthenticated session request is rejected and the SPA shows **Sign in with Google**.
- [ ] Login uses the exact callback, `openid email profile`, state, nonce, and PKCE S256; a verified `@sentry.io` account receives an HttpOnly, Secure, SameSite=Lax session cookie.
- [ ] Wrong-domain and unverified accounts fail without a session; replayed callback/state fails.
- [ ] Login rotates the previous session, logout revokes it, and missing or incorrect `Origin` rejects mutations and logout.
- [ ] A member cannot use admin APIs; a D1 administrator can; browser or Google claims cannot escalate roles.

## Core data and product journeys

- [ ] A reviewed production-source rehearsal snapshot imports and reconciles twice with identical source-scoped counts, deterministic R2 keys, and no unexplained missing, duplicate, reference, size, or checksum mismatch.
- [ ] Representative years, ideas, projects, groups, teams, awards, ballots, analytics, and records without media render correctly.
- [ ] Member journeys cover browsing, profile/session behavior, creating/editing/claiming permitted projects, teams, voting, and authorized private attachment upload/download.
- [ ] Administrator journeys cover year/group/project administration, voting configuration, nominations, awards, analytics, and role enforcement.
- [ ] Private R2 objects have no public bucket URL; authorized downloads work and unauthorized access fails.

## Disabled-video proof

- [ ] Session/API state reports `STREAM_MODE=disabled` in production.
- [ ] Video upload, playback, screening, and archive actions are absent or visibly unavailable in user and admin journeys.
- [ ] Direct video mutations fail closed without creating lifecycle rows or calling a Stream gateway.
- [ ] No Stream resource, webhook, Stream secret, video-service secret, or R2 S3 credential is required for the core deployment.

Any unexplained auth/RBAC, import/reconciliation, D1/R2, core journey, or disabled-mode failure blocks cutover. A green local fake or successful deployment command alone is not remote evidence.
