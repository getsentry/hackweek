# Architecture

## System

```text
Browser -> Google authorization-code login -> Worker/Hono -> D1 users/sessions/data
Browser ------------------------------------> Worker/Hono -> private R2
Browser ------------------------------------> Worker/Hono -> Static Assets
```

The React 19 SPA uses Wouter and TanStack Query and retains the Sentry `#HACKWEEK` masthead, Rubik voice, ink/blurple palette, squiggle, archive banners, compact controls, and responsive project hierarchy. One Hono Worker serves the API and Static Assets. D1 is the relational source of truth and R2 is private. The core production rollout sets `STREAM_MODE=disabled`, so video actions are hidden or unavailable. Stream ingest, playback, screening, and archive paths remain dormant unless a separately approved rollout enables real mode.

## Authentication and authorization

Application-owned Google OpenID Connect is the only browser authentication path in every environment. D1 stores ten-minute, single-use state/nonce/PKCE attempts and SHA-256 hashes of random eight-hour session tokens. The browser receives only an HttpOnly, SameSite=Lax cookie, with `Secure` required outside HTTP loopback development. Google ID tokens are validated against Google JWKS for signature, issuer, audience, expiry, nonce, verified email, and the exact `sentry.io` domain. D1 `users.is_admin` is the only role authority.

Local development requires a real Google OAuth Web application configured for the exact loopback origin and callback in `.dev.vars`. There is no fixed local identity, signed identity cookie, client role, Access header, or Firebase Auth path.

SameSite cookies plus mandatory exact Origin checks protect authenticated mutations/logout. OAuth callbacks are state protected. Login rotates existing sessions; logout revokes the current session. Dormant Stream webhook and video-job endpoints retain separate machine-auth boundaries for a possible later rollout.

## Core data

`users`, `oauth_login_attempts`, `user_sessions`, `years`, `groups`, `projects`, `project_members`, `award_categories`, `project_nominations`, `votes`, `awards`, `media`, `project_videos`, `stream_events`, and `screening_order` are normalized D1 tables. Foreign keys, uniqueness, checks, and triggers are the final concurrency boundary.

Migration source IDs remain for deterministic one-off import and stable product links. Google subjects are independent of migrated Firebase source IDs. Historical attachments move to private R2. Video promotion is not part of the core migration.

Detailed invariants are documented in [`architecture/projects.md`](architecture/projects.md) and [`architecture/voting-administration.md`](architecture/voting-administration.md).

## Verification boundary

`npm run verify` proves local schema, session/auth security with deterministic fake JWKS/exchange boundaries, migration fixtures, D1/R2 behavior, dormant video contracts, and frontend/controller journeys. It cannot prove the real Google OAuth client, deployed origin/callback, Cloudflare bindings, or remote imported data. Those require the core checklist in [`cloudflare-validation.md`](cloudflare-validation.md). Real Stream and screening have a separate deferred gate in [`video-operations.md`](video-operations.md).
