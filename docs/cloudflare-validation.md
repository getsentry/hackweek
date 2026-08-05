# Cloudflare environment validation

Exactly one real Cloudflare environment is created in the Sentry Enterprise account and validated while Firebase/DNS remains authoritative. No promotion or environment-to-environment copy follows; after approval, the human changes DNS to this same environment.

## Entry and deployment

- [ ] `npm run verify` passes from a clean checkout.
- [ ] [`cloudflare-setup.md`](cloudflare-setup.md) is reviewed; every placeholder is replaced; Google OAuth origins and callbacks exactly match `APP_ORIGIN`.
- [ ] `GOOGLE_CLIENT_SECRET` and other Worker secrets are installed interactively and never committed.
- [ ] Protected deployment workflow runs for the exact SHA and exact account ID.
- [ ] D1 migrations apply and the verified production snapshot imports/reconciles twice without unexplained mismatch.

## Google OAuth and authorization evidence

- [ ] unauthenticated `/api/session` is 401 and the SPA shows **Sign in with Google**;
- [ ] login redirects to Google with exact callback, scopes `openid email profile`, state, nonce, and PKCE S256;
- [ ] a verified `@sentry.io` account returns to the fixed callback and receives an HttpOnly/Secure/SameSite=Lax cookie;
- [ ] wrong-domain or unverified accounts fail without creating a session;
- [ ] replayed callback/state fails, login rotates the old session, and logout revokes/clears it;
- [ ] missing/incorrect Origin rejects mutation and logout;
- [ ] member cannot access admin APIs; D1 admin can; browser/Google role claims cannot escalate.

Record only non-secret request IDs/statuses, timestamps, release SHA, and pass/fail outcomes. Never record codes, Google tokens, client secret, state/verifier/nonce, ID tokens, cookies, or raw session tokens.

## D1, R2, Stream, and product

- [ ] intended D1/R2 bindings are present and representative archive/project/team/award/vote/media records render;
- [ ] private attachment download authorization works and second import is idempotent;
- [ ] >200 MB tus upload interrupts/resumes and bytes go directly to Stream;
- [ ] signed Stream webhook rejects altered/stale/replay and advances once;
- [ ] measurement reaches ready and protected HLS works only with a fresh token;
- [ ] one selected historical R2 video follows the same lifecycle;
- [ ] individual and full screening passes title/preload/controls/fullscreen/audio/Meet checks;
- [ ] Drive archive succeeds without changing screening readiness.

If credentials, permissions, Google client settings, capabilities, or account coordination are missing, record the exact blocker and stop. A green local fake or successful deployment command alone is not remote integration evidence.
