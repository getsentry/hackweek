# Video processing production rollout

This runbook prepares the R2 + Workflow + Container path. It does not authorize or perform any Cloudflare production mutation.

## Prepared resource contract

The production declaration in `wrangler.production.json` uses these isolated future video resources:

| Binding                     | Proposed resource                                        | Purpose                                                        |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `VIDEOS`                    | R2 bucket `hackweek-video-media-production`              | Private immutable originals and canonical derivatives          |
| `VIDEO_PROCESSING_WORKFLOW` | Workflow `hackweek-video-processing-production`          | One durable instance per video attempt                         |
| `VIDEO_PROCESSOR`           | Container Durable Object class `VideoProcessorContainer` | Attempt-isolated FFmpeg invocation                             |
| Container application       | `hackweek-video-processor-production`                    | Digest-pinned `Dockerfile.video-processor` image               |
| `DB`                        | Existing `hackweek-db` binding                           | Upload, attempt, fencing, state, and retained-object inventory |

Migration 0007 is an expand-only transition. The R2 Worker uses `video_submissions`, `video_uploads`, `video_upload_parts`, and `video_processing_attempts`; the legacy `project_videos` columns and `stream_events` table remain unchanged solely so the recorded pre-release Worker can run before deployment or after rollback. The R2 Worker has no active Stream path.

Production declares both `max_instances: 2` and `VIDEO_PROCESSOR_CONCURRENCY=2`. Keep the two values equal. Local development uses one. The Container has no Internet access and receives no R2 account credential; its outbound handler scopes source/output access to the current D1 attempt.

Required non-secret variables are `APP_ORIGIN`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL_DOMAIN`, `VIDEO_PROCESSOR_CONCURRENCY`, and `VIDEO_PROCESSING_AUTOSTART`. `GOOGLE_CLIENT_SECRET` remains the required Worker secret. There is no Stream, HLS, public-R2, service-token, Queue, or general R2 credential binding.

## Explicit approval boundary

A human production owner must approve the exact commit, account, names, expected storage growth, benchmark/tuning decision, D1 backup window, smoke/rollback operators, and recorded pre-release Worker version before any command below that uses `--remote`, `r2 bucket create`, `secret put`, `deploy`, or `rollback` is run. The release record must include the passing populated-legacy expand/old-query/new-query/FK migration test for that exact commit.

Until that approval, only these non-mutating local checks are allowed:

```bash
npm ci
npm run verify
npm audit --omit=dev --audit-level=high
npm run video:benchmark
npm run build
npm run deploy:dry-run
```

`deploy:dry-run` compiles the Worker, validates bindings, and builds the Container locally. It does not upload, create, list, or mutate a Cloudflare resource.

## Local benchmark evidence

Command: `npm run video:benchmark`

Environment recorded 2026-08-11: OrbStack Linux ARM64 Docker engine 29.4.0 on an ARM64 development host; digest-pinned FFmpeg 8.0.1 image. CPU is the delta of cgroup `usage_usec` for the running Container; wall time wraps the `process-file` invocation. Fixtures are generated at runtime with synthetic motion plus audible 48 kHz audio. They are deliberately short and bounded, so these numbers validate profiles and provide a tuning baseline—not a production cost, throughput, or ten-minute latency promise.

| Profile          | Source                 |       Input |      Output |    Wall | Container CPU | Output loudness |
| ---------------- | ---------------------- | ----------: | ----------: | ------: | ------------: | --------------: |
| correctness-360p | 640×360, 2 s, 24 fps   |   435,740 B |   263,556 B | 0.805 s |       1.052 s |     -15.95 LUFS |
| bounded-720p     | 1280×720, 4 s, 24 fps  | 3,252,808 B | 1,829,962 B | 0.657 s |       2.181 s |     -15.96 LUFS |
| bounded-1080p    | 1920×1080, 4 s, 24 fps | 7,263,137 B | 3,620,283 B | 1.008 s |       4.464 s |     -15.96 LUFS |

Before production approval, repeat the benchmark on the release commit and run a separately approved bounded staging sample representative of expected durations. Start with concurrency two only if p95 processing wall time, Container CPU/memory, scratch disk, Workflow retries, and queued wait remain within the agreed event window. Reduce both concurrency declarations together if account/container pressure appears; increasing beyond two requires a new review and benchmark.

## Later provisioning order (mutating; approval required)

The following is an operator checklist, not deployment automation. Stop if the configured Cloudflare account is not `773afa1f62ff86c80db4f24f7ff1e9c8` or any proposed resource name is already owned for another purpose.

1. Record the release commit and current pre-release Worker version ID for rollback. Confirm it is the version covered by the legacy `project_videos`/`stream_events` SQL contract in the migration test. Obtain an explicit go/no-go from the production owner.
2. Run all local checks from the approval section and archive their output with the release record, including `npm run test:migration -- test/migration/migration.test.ts test/e2e/video-rollout.test.ts`.
3. Create the isolated private video bucket:

   ```bash
   npx wrangler r2 bucket create hackweek-video-media-production \
     --config wrangler.production.json
   ```

4. Set the existing Worker’s Google OAuth secret if it is not already present. The command prompts securely; never place the value in shell history:

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET \
     --config wrangler.production.json
   ```

5. Apply reviewed D1 migrations during the approved backup window:

   ```bash
   npx wrangler d1 migrations apply hackweek-db \
     --remote --config wrangler.production.json
   ```

   Migration 0007 only expands the schema. The still-deployed pre-release Worker continues to read and write its unchanged `project_videos` columns and `stream_events`; the new R2 tables can be queried independently. If migration application or the following deploy fails, leave the pre-release Worker serving and investigate—do not attempt a destructive schema reversal.

6. Deploy the reviewed declaration:

   ```bash
   npx wrangler deploy --config wrangler.production.json \
     --containers-rollout gradual
   ```

   Wrangler materializes the declared `hackweek-video-processing-production` Workflow, `hackweek-video-processor-production` Container application/image, and `VideoProcessorContainer` Durable Object migration as part of this approved deploy. Do not create similarly named resources by hand.

7. Perform the smoke checklist below with one small generated/approved non-sensitive clip before allowing event uploads.

The existing manual GitHub deployment workflow remains an alternative controlled entry point only after its environment approval and typed confirmation. Do not run both paths for one release.

## Production smoke criteria

Use a test project and authenticated creator/member/admin accounts. The release is healthy only when all checks pass:

1. Anonymous create, playback descriptor, and content requests return `401`; a non-member upload returns `403`.
2. Multipart create → part upload → refresh/resume → completion succeeds; duplicate completion returns the same video/attempt.
3. State advances queued → processing → ready, and Workflow instance `video-<video-id>-attempt-1` completes all named steps.
4. D1 records distinct original/processed keys, duration ≤600 s, and loudness within -16 ±0.7 LUFS; the downloaded derivative probes as H.264/AAC `yuv420p`.
5. Authenticated content returns `200`, a seek returns exact `206`/`Content-Range`, and an unsatisfiable range returns `416`.
6. Only the ready video appears in saved screening order with the correct project/team overlay. Pause, skip, fullscreen, ended advance, and recoverable error advance work in the event browser.
7. Confirmed retirement removes project/reel playback while both R2 objects remain present. Do not delete the smoke objects.
8. Two concurrent independent project jobs can run; a third waits/retries. A same-project second active upload conflicts.

Useful read-only diagnostics after deployment:

```bash
npx wrangler tail hackweek --config wrangler.production.json --format json
npx wrangler workflows instances describe \
  hackweek-video-processing-production video-<video-id>-attempt-<attempt> \
  --config wrangler.production.json
```

## Observability and alerts

`observability.enabled` is set in production. Workflow logs emit JSON with `component=video-processing`, an event name, `videoId`, attempt, and bounded failure text; they never include object keys, media bytes, cookies, OAuth values, or R2 credentials.

Create dashboard/alert ownership before rollout for:

- Workflow failed/terminated instance count >0 over 5 minutes;
- `processor_failed` or `claim_failed` events >0, grouped by attempt and bounded error;
- oldest queued/running D1 attempt >10 minutes;
- queued depth above 2 for 10 minutes (capacity pressure at cap two);
- Worker `/api/projects/*/video*` and `/api/videos/*/content` 5xx rate >1% over 5 minutes;
- Container CPU, memory, scratch disk, restart, and timeout pressure;
- `video_submissions.status='failed'` growth and retries per video;
- R2 object count/bytes and monthly growth for `hackweek-video-media-production`.

Never place full request headers, session cookies, source/output object keys, or media payloads in an alert. Link alerts to this runbook and name an event-time operator.

## Rollback

Rollback is state-preserving. Do not delete R2 objects, Workflow instances, D1 rows, or the Container application during incident response.

1. Pause new R2 video completion/processing by preparing `VIDEO_PROCESSING_AUTOSTART=false` on a reviewed incident commit when the Worker is healthy enough to deploy that change. New completed R2 uploads remain queued rather than being published incorrectly.
2. If the Worker release itself is faulty, roll back to the recorded pre-release Worker version that was captured and compatibility-tested before rollout:

   ```bash
   npx wrangler rollback <recorded-pre-release-version-id> \
     --name hackweek --message "Rollback video rollout: <incident>"
   ```

   This target remains schema-compatible after 0007 because the migration does not alter `project_videos` or `stream_events`. Do not select an older unrecorded version. The rollback version may use its original Stream lifecycle; no Stream behavior is present in the new R2 Worker.

3. Do not reverse migration 0007. Leave legacy rows/events, R2 queued/running/failed attempt rows, and all original/derivative objects intact. A late R2 result cannot publish over a retired or newer attempt.
4. Restore the R2 release only after `npm run verify`, the production smoke subset, reconciliation of any legacy writes made during rollback, and incident-owner approval pass on the corrective release. Re-enable autostart and keep concurrency at or below two.
5. Reconcile status and inventory; do not manually mark a video ready and do not copy an unprobed object into a canonical key.

D1 migration 0007 is a forward-only expansion. Worker rollback does not reverse it, and no database downgrade is required.

## Future contraction (separate approval required)

Do not drop, rename, or repurpose `project_videos`, its legacy columns/indexes, or `stream_events` in this release. They define the tested pre-release rollback contract.

A later contraction requires a separate production-owner approval and release after this rollback target is retired. Before contraction, inventory and reconcile legacy rows/events—including writes made during any rollback—record a new R2-compatible rollback target, prove no deployed Worker queries the legacy schema, and take the approved D1 backup. Only then may a new migration remove the legacy tables. Renaming `video_submissions` is not part of 0007; if desired, it requires its own expand/deploy/contract sequence rather than an in-place destructive rename.

## Retained-storage policy

No automatic deletion is permitted for completed originals or derivatives, including retired submissions and stale completed derivatives. Only incomplete expired multipart uploads may be aborted. The retained bytes support recovery and later delivery changes, but storage growth is an accepted operational risk.

Track per-video original/derivative keys and sizes in the monthly inventory, alert on growth, and review retention with the data owner after the event. Any future deletion policy requires separate human approval, an inventory/export plan, and a new implementation; it is not part of this rollout.
