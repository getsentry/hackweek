# Cloudflare setup

This is an operator guide, not an automated provisioning script. Resource creation, account IDs, tokens, secrets, domains, Access policy, and DNS remain human-controlled. Do not put real values in Git.

## Required staging resources

1. A Workers application named `hackweek-staging` with Workers Static Assets.
2. A D1 database for the staging schema and rehearsal data.
3. A private R2 bucket for migrated attachments.
4. Cloudflare Stream in the selected account, including its one account-level webhook subscription.
5. A Cloudflare Access self-hosted application for the staging hostname with a company Google Workspace allow policy.
6. A least-privilege deployment API token scoped to the staging Worker, D1, and R2 resources; a separate Stream token; and separate service credentials for video jobs.

Copy `wrangler.staging.json` to an operator-reviewed configuration change by replacing every `REPLACE_ME` value. The committed placeholders make accidental deployment fail. Do not add a production environment until the staging gate is approved.

## Access

Set non-secret staging vars:

```text
AUTH_MODE=access
ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
ACCESS_AUD=<Access application AUD tag>
ALLOWED_EMAIL_DOMAIN=sentry.io
```

Access must protect the hostname at the edge. The Worker independently verifies `Cf-Access-Jwt-Assertion` using the team JWKS and exact issuer/audience/domain. Validate both layers: an unauthenticated browser must be stopped by Access, and an altered/wrong-audience token must be rejected by the Worker.

## D1 and R2

Record only the staging D1 ID and R2 bucket name in the reviewed staging config. Apply migrations explicitly:

```bash
npx wrangler d1 migrations apply hackweek-db \
  --remote --env staging --config wrangler.staging.json --yes
```

`DB` and `ATTACHMENTS` must bind to staging resources. R2 remains private; browser attachment downloads use authorized Worker routes. Migration remote writes additionally require `--target staging --env staging --confirm staging`.

## Stream and service secrets

Non-secret vars:

```text
STREAM_MODE=real
STREAM_ACCOUNT_ID=<account id>
STREAM_ALLOWED_ORIGIN=<staging hostname without scheme/path>
STREAM_DELIVERY_HOST=customer-<code>.cloudflarestream.com
R2_ACCOUNT_ID=<account id>
R2_BUCKET_NAME=<staging attachment bucket>
```

Worker secrets are entered interactively by an authorized operator:

```bash
npx wrangler secret put STREAM_API_TOKEN --env staging --config wrangler.staging.json
npx wrangler secret put STREAM_WEBHOOK_SECRET --env staging --config wrangler.staging.json
npx wrangler secret put VIDEO_SERVICE_TOKEN --env staging --config wrangler.staging.json
npx wrangler secret put R2_ACCESS_KEY_ID --env staging --config wrangler.staging.json
npx wrangler secret put R2_SECRET_ACCESS_KEY --env staging --config wrangler.staging.json
```

The R2 S3 credentials are only for an explicitly selected historical video that Stream fetches through a 15-minute signed source URL. They are not required for ordinary attachment reads or direct new uploads. Never promote every old video automatically.

The measurement/archive workflows use GitHub environment/repository secrets described in [`video-operations.md`](video-operations.md). Access user identity and `VIDEO_SERVICE_TOKEN` are intentionally separate.

## Webhook and deployment

Register the documented account-level Stream webhook only after coordinating with the account owner; replacing it may affect another application. Use the exact staging `/api/stream-webhook` URL and immediately store the returned signing secret.

Staging deployment is manual-only through `.github/workflows/staging.yml`, requires the protected `hackweek-staging` GitHub environment, the exact `deploy-staging` confirmation, successful reusable verification, non-placeholder configuration, and environment-scoped Cloudflare credentials. It applies D1 migrations before deploying. It does not configure Access, register Stream webhooks, import data, or modify DNS.

## Secrets checklist

- [ ] No account ID, API token, service token, webhook secret, export, report, or real email is committed.
- [ ] Deployment token is environment-scoped and least privilege.
- [ ] Stream, webhook, measurement/archive, and R2 credentials are distinct where supported.
- [ ] GitHub environment requires an authorized reviewer.
- [ ] Vite client output contains no secret; only Worker bindings receive secrets.
- [ ] Rotation owner and expiry/review date are recorded outside Git.
