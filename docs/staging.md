# Staging gate

Staging is a separate operator-approved milestone. This repository contains credential-free configuration and a manual GitHub workflow, but no staging deployment was performed during local readiness work.

## Entry criteria

- [ ] `npm ci --no-audit --no-fund` and `npm run verify` pass from a clean checkout.
- [ ] `git grep`/dependency inspection finds no Firebase runtime, deploy action, config, rules, or compatibility source.
- [ ] The seeded local journey covers member/admin RBAC, archives, migration/reconciliation, project/team/media, voting/admin, fake tus lifecycle, screening order, and fake playback refusal.
- [ ] An authorized operator has reviewed [`cloudflare-setup.md`](cloudflare-setup.md), replaced staging placeholders, configured the protected GitHub environment, and supplied least-privilege environment secrets.
- [ ] Resource/account ownership, Access policy, Stream webhook coordination, cost, retention, and rollback owner are agreed.

## Deploy procedure

1. Review the exact commit and `wrangler.staging.json`; reject any `REPLACE_ME` or unexpected production resource.
2. Configure the `hackweek-staging` GitHub environment with required reviewer(s), `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID`.
3. Enter Worker secrets interactively as described in `cloudflare-setup.md`.
4. Run **Deploy staging** manually and type exactly `deploy-staging`.
5. Record the workflow URL, commit SHA, deployment URL, D1 migration output, and Worker deployment ID outside secrets.
6. Configure/verify Access and the Stream webhook manually; the workflow intentionally does not do these account-level operations.

## Required evidence

### Access and authorization

- [ ] unauthenticated browser and curl are blocked by Access;
- [ ] valid Workspace identity reaches `/api/session` with the expected profile;
- [ ] altered, expired, wrong-audience, wrong-issuer, service, and wrong-domain tokens fail;
- [ ] member cannot access admin APIs; D1 admin can; browser role/header changes cannot escalate.

### D1, R2, and migration

- [ ] bindings name the intended staging resources and all migrations are applied;
- [ ] exact export dry-run is reviewed before any staging import;
- [ ] explicit staging import/reconcile reports have zero unexplained count, reference, size, path, or checksum mismatch;
- [ ] representative historical archive/project/team/award/vote/media records render and private attachment download authorization works;
- [ ] second rehearsal import is idempotent.

### Real Stream and screening

- [ ] >200 MB tus upload is interrupted and resumes; bytes go to Stream, never Worker;
- [ ] signed URL requirement, max duration, and allowed origin are present;
- [ ] altered/stale webhook fails; valid webhook transitions once; replay is a no-op;
- [ ] measurement reaches ready and clamp math is correct; failed measurement is visible/retryable;
- [ ] protected HLS works with a fresh token; raw UID and expired token fail;
- [ ] exactly one chosen historical R2 video is promoted and follows the same lifecycle;
- [ ] individual permalink and full screening pass title/preload/ended/controls/fullscreen/audio checks;
- [ ] Meet-style tab-audio rehearsal passes;
- [ ] Drive archive succeeds without changing screening readiness.

## Exit and claims

Only recorded remote evidence can satisfy these checks. A green local fake or a successful deployment command alone cannot prove Access, Stream, HLS, Web Audio, Meet, webhook delivery, archive, or representative migration behavior. If credentials, permissions, capabilities, or account-level coordination are missing, record the exact blocker and stop; do not weaken the gate or substitute production resources.
