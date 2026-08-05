# Production cutover and rollback

Production migration is operator-assisted. No repository script changes DNS, disables/deletes Firebase, creates production resources, or performs an irreversible cutover. Cloudflare environment evidence and human approval are mandatory first.

## Go/no-go prerequisites

- Cloudflare environment evidence in [`cloudflare-validation.md`](cloudflare-validation.md) is complete for the exact release commit.
- Production Cloudflare resources/configuration, Google OAuth configuration, secrets, observability, cost/retention, and operators have been separately approved.
- Export/import rehearsal using a recent real export completes twice with no unexplained mismatch.
- A maintenance window, write-freeze mechanism, DNS owner, rollback decision owner, incident channel, and Firebase read-only retention period are agreed.
- DNS TTL has been reviewed in advance by the human DNS operator.
- Only explicitly selected historical videos are approved for Stream promotion; all source storage objects migrate to private R2.

## Final production migration (operator-assisted)

- [ ] Announce maintenance window and write freeze.
- [ ] Human stops legacy writes and verifies the freeze; there is no dual write.
- [ ] Export Firebase Realtime Database and Storage to encrypted ignored/operator-held storage.
- [ ] Record export timestamp, source counts, object bytes, checksums, tool version, and release SHA.
- [ ] Run validate and dry-run; resolve every error and document every accepted warning.
- [ ] Rehearse exact export locally twice; verify idempotent source counts and deterministic R2 keys.
- [ ] Import into the explicitly reviewed production destination using operator-held configuration and credentials.
- [ ] Reconcile counts, missing/duplicate references, paths, sizes, checksums, D1 constraints, and object outcomes.
- [ ] Human reviews every blocking mismatch; do not proceed with unexplained discrepancies.
- [ ] Verify representative old/new years, ideas, projects, teams, groups, awards, ballots, admin analytics, attachments, RBAC, and projects without videos.
- [ ] Promote only the chosen historical videos; validate real Stream lifecycle/protected playback.
- [ ] Run screening checks for order, individual playback, controls, preloading, gain, and failure visibility.
- [ ] Human changes DNS to the Cloudflare application.
- [ ] Observe Google OAuth sessions, Worker, D1, R2, Stream, client errors, latency, and business journeys through the agreed high-risk window.
- [ ] Retain Firebase deployment/data read-only and retain verified exports for the rollback window.

The migration CLI intentionally supports only `local` and explicitly confirmed `cloudflare`. Production destination configuration and commands must be separately reviewed by operators; do not repurpose `--target Cloudflare environment` against production.

## Stop and rollback conditions

Stop before DNS if any critical count/checksum/reference mismatch, missing expected attachment, auth/RBAC failure, vote invariant failure, project/admin journey failure, Stream/HLS failure, or screening failure remains unexplained.

After DNS, the rollback owner may direct the human DNS operator to return traffic to the retained read-only legacy deployment if there is widespread authentication failure, data corruption/loss, material write-path failure, sustained platform outage, or screening-blocking video failure that cannot be safely corrected inside the window.

Rollback procedure:

1. Announce rollback and stop writes to the replacement.
2. Preserve Worker/D1/R2/Stream logs and record the last successful replacement write time.
3. Human changes DNS back to the retained legacy endpoint.
4. Do **not** blindly replay replacement writes into Firebase. Reconcile any writes made after cutover and choose an explicit operator-reviewed recovery plan.
5. Keep Cloudflare resources intact for investigation; migration tooling does not delete data.
6. Confirm legacy read/access behavior, communicate status, and schedule a new rehearsal.

A rollback is not safe if writes continued independently in both systems. This is why write freeze, no dual-write, exact timestamps, and a short decision window are required.

## Post-cutover and decommission

- [ ] Confirm monitoring, representative user/admin/video journeys, and reconciliation at 1 hour, 1 business day, and the agreed retention milestones.
- [ ] Archive final reports/checksums and ownership records in approved operator storage, not Git.
- [ ] Rotate temporary migration/deployment credentials and remove unneeded migration export access.
- [ ] Keep Firebase read-only until the rollback period and data-retention approval complete.
- [ ] Only then obtain explicit human approval to remove legacy hosting/data/resources; deletion is a separate change with backups verified first.
- [ ] Remove temporary DNS records/tokens, update incident/service ownership, and record costs/retention.
- [ ] Do not claim decommission until remote evidence and human approvals are recorded.
