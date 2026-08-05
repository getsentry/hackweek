# Architecture

## System

```text
Browser -> Google authorization-code login -> Worker/Hono -> D1 users/sessions/data
Browser ------------------------------------> Worker/Hono -> private R2
Browser -----------------------------------------------> Cloudflare Stream tus/HLS
Signed Stream webhook / service-token jobs ------------> Worker/Hono
```

The React 19 SPA uses Wouter and TanStack Query and retains the Sentry `#HACKWEEK` masthead, Rubik voice, ink/blurple palette, squiggle, archive banners, compact controls, and responsive project hierarchy. One Hono Worker serves the API and Static Assets. D1 is the relational source of truth; R2 is private; video bytes never traverse the Worker.

## Authentication and authorization

`AUTH_MODE=google` implements a standard application-owned OpenID Connect authorization-code flow. D1 stores ten-minute, single-use state/nonce/PKCE attempts and SHA-256 hashes of random eight-hour session tokens. The browser receives only an HttpOnly, Secure, SameSite=Lax cookie. Google ID tokens are validated against Google JWKS for signature, issuer, audience, expiry, nonce, verified email, and the exact `sentry.io` domain. D1 `users.is_admin` is the only role authority.

`AUTH_MODE=local` is an explicit same-origin loopback-only fixed identity for development. It still resolves the D1 user and role. There is no deployed local fallback, signed identity cookie, client role, Access header, or Firebase Auth path.

SameSite cookies plus mandatory exact Origin checks protect authenticated mutations/logout. OAuth callbacks are state protected. Login rotates existing sessions; logout revokes the current session. The signed Stream webhook and video job bearer token remain separate machine-auth boundaries.

## Core data

`users`, `oauth_login_attempts`, `user_sessions`, `years`, `groups`, `projects`, `project_members`, `award_categories`, `project_nominations`, `votes`, `awards`, `media`, `project_videos`, `stream_events`, and `screening_order` are normalized D1 tables. Foreign keys, uniqueness, checks, and triggers are the final concurrency boundary.

Migration source IDs remain for deterministic one-off import and stable product links. Google subjects are independent of migrated Firebase source IDs. Historical media moves to private R2; only selected historical videos enter Stream.

## Verification boundary

`npm run verify` proves local schema, session/auth security with deterministic fake JWKS/exchange boundaries, migration fixtures, D1/R2 behavior, fake Stream contracts, and frontend/controller journeys. It cannot prove the real Google OAuth client, deployed origin/callback, Cloudflare bindings, Stream tus/webhook/HLS, Web Audio/Meet, or remote imported data. Those require the single-environment checklist in [`cloudflare-validation.md`](cloudflare-validation.md).
