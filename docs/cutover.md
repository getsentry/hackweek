# Production cutover and rollback

The canonical Cloudflare production URL is exactly `https://hackweek.getsentry.workers.dev`. Cutover is an operator-controlled traffic handoff to that URL; there is no DNS change. No repository script freezes Firebase, changes user traffic, deletes legacy resources, or performs an irreversible cutover.

The production migration source is Firebase project `hackweek-34e1d`. Project `hackweek-34e1d-dev` is development and must never be used for the final production export.

## Go/no-go prerequisites

- Core evidence in [`cloudflare-validation.md`](cloudflare-validation.md) is complete for the exact release SHA with production `STREAM_MODE=disabled`.
- Production Cloudflare resources/configuration, Google OAuth, secrets, observability, operators, and rollback owner are approved.
- A recent export from `hackweek-34e1d` has completed an idempotent import/reconciliation rehearsal with no unexplained mismatch.
- The maintenance window, human-enforced write freeze, read-only verification method, incident channel, traffic-handoff owner, and Firebase retention period are agreed.
- The retained Firebase production deployment and verified exports remain available for operator-controlled rollback.

The final manual production import has not happened yet. Preserve the migration scripts, tests, fixtures, and reviewed tooling through that import and reconciliation.

## Final production migration

- [ ] Announce the maintenance window and write freeze.
- [ ] A human stops writes in Firebase project `hackweek-34e1d` and independently verifies that production is read-only. There is no dual write.
- [ ] Export the final Realtime Database and Storage data from `hackweek-34e1d` to encrypted, ignored, operator-held storage; verify the export did not come from `hackweek-34e1d-dev`.
- [ ] Record the source project, export timestamp, counts, object bytes, checksums, tool version, and release SHA.
- [ ] Run validation and dry-run; resolve every error and review every warning.
- [ ] Rehearse the exact final export locally twice and confirm deterministic source-scoped counts and R2 keys.
- [ ] Run the final import against the explicitly reviewed production destination:

  ```bash
  npm run migrate:cloudflare -- \
    --database migration-input/database.json \
    --storage-manifest migration-input/storage-manifest.json \
    --storage-root migration-input/storage \
    --database-name hackweek-db \
    --bucket-name hackweek-attachments \
    --confirm cloudflare \
    --config wrangler.production.json \
    --report migration-output/cloudflare-import.migration-report.json
  ```

  Use the reviewed inputs and procedure in [`migration.md`](migration.md); do not add `--env` or substitute another config.

- [ ] Run the documented Cloudflare reconciliation, repeat import/reconciliation to prove idempotency, and explain every count, reference, path, size, checksum, or object mismatch.
- [ ] Verify representative years, ideas, projects, teams, groups, awards, ballots, analytics, attachments, RBAC, and records without media.
- [ ] Reconfirm Google OAuth, core user/admin journeys, private R2 access, and production `STREAM_MODE=disabled`; video actions must remain hidden or unavailable.
- [ ] A human makes `https://hackweek.getsentry.workers.dev` the announced and linked production entry point.
- [ ] Observe Google OAuth, Worker, D1, R2, Static Assets, client errors, latency, and core business journeys through the agreed high-risk window.
- [ ] Retain Firebase production and final exports read-only for the rollback window.

## Stop and rollback

Stop before traffic handoff for any unexplained critical count/checksum/reference mismatch, missing expected attachment, auth/RBAC failure, vote invariant failure, core user/admin journey failure, or failure to prove disabled video mode.

After handoff, the rollback owner may withdraw the Cloudflare URL from user communications and direct users back to the retained Firebase production deployment if there is widespread authentication failure, data corruption/loss, a material write-path failure, or a sustained platform outage that cannot be corrected safely inside the window.

1. Announce rollback and stop writes to the Cloudflare replacement.
2. Preserve Worker, D1, R2, Static Assets, and client evidence; record the last successful replacement write time.
3. Restore the retained `hackweek-34e1d` production deployment to the operator-approved writable state, direct users to its retained URL, and verify access before resuming work.
4. Do not blindly replay Cloudflare writes into Firebase. Reconcile post-handoff writes and approve an explicit recovery plan.
5. Keep Cloudflare resources intact for investigation; migration tooling does not delete data.
6. Communicate status and schedule a new rehearsal.

Rollback is unsafe if both systems accept independent writes. The human write freeze, no-dual-write rule, exact timestamps, and short decision window are mandatory.

## Post-cutover and decommission

- [ ] Confirm monitoring, representative core user/admin journeys, and reconciliation at 1 hour, 1 business day, and the approved retention milestones.
- [ ] Archive final reports/checksums and ownership records in approved operator storage, not Git.
- [ ] Rotate temporary migration/deployment credentials and remove unneeded export access only after final import evidence is complete.
- [ ] Keep Firebase read-only until the rollback period and data-retention approval complete.
- [ ] Obtain explicit human approval before removing legacy hosting, data, migration tooling, or resources; deletion is a separate change with backups verified first.
- [ ] Update incident/service ownership and record costs/retention. Do not claim decommission until remote evidence and human approvals are recorded.
