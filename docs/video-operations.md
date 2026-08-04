# Video operations

See [`screening.md`](screening.md) for presenter controls, state, day-of checks, Meet-style validation, and incident handling. See [`staging.md`](staging.md) for the remote evidence gate.

The video platform has two deliberately different modes:

- `STREAM_MODE=fake` is for local application development and tests. It exercises authorization, D1 state, webhooks, jobs, and client contracts. It does **not** accept bytes, transcode, make HLS, or claim playback works.
- `STREAM_MODE=real` is staging-only until the staging integration checklist passes. Browser video bytes go directly to Cloudflare Stream over tus. The Worker only provisions the upload and stores lifecycle metadata.

## Lifecycle and authorization

Each non-idea project can have zero or one primary `project_videos` row. Project creators, members, and administrators may create, replace, retry, or delete it. Ideas cannot have videos. Replacement is allowed after failure or deletion; active uploads and processed videos must be deleted first.

The server owns transitions:

```text
uploading -> measuring -> ready
          \-> failed(stream)
measuring -> failed(measurement) -> measuring (retry)
```

Cloudflare Stream webhooks arrive only after processing completes, so there is no fabricated intermediate webhook transition. A ready webhook requires `readyToStream=true`, `status.state=ready`, and `pctComplete=100`. A ready video still does not enter a screening playlist until loudness has been measured. Archive state is separate and never gates `ready`.

Upload requests accept file name and byte length only. The Worker sends Stream `Tus-Resumable: 1.0.0`, `Upload-Length`, creator, a 600-second limit, 30-minute expiry, signed-URL requirement, and the configured allowed origin. The response contains the one-time tus URL and recommended 50 MiB chunk size. API tokens never appear in browser output. Cloudflare currently requires tus chunks between 5 MiB and 200 MiB and divisible by 256 KiB (except qualifying final/single chunks).

## Local setup

Copy `.dev.vars.example` to `.dev.vars`. Keep:

```dotenv
STREAM_MODE="fake"
STREAM_ALLOWED_ORIGIN="localhost"
STREAM_DELIVERY_HOST="customer-fake.cloudflarestream.com"
STREAM_WEBHOOK_SECRET="a-local-test-secret"
VIDEO_SERVICE_TOKEN="a-separate-local-job-secret"
```

Apply migrations and run the app:

```sh
npm run db:migrate:local
npm run dev
```

A fake upload URL is a contract fixture, not an ingest endpoint. Fake protected playback returns `mode: "fake"` and `manifestUrl: null`, explicitly preventing local UI from mistaking it for transcoded media.

To exercise a webhook fixture, preserve the JSON body byte-for-byte and compute hex HMAC-SHA256 over `<unix-seconds>.<raw-body>` with `STREAM_WEBHOOK_SECRET`. Send `Webhook-Signature: time=<unix-seconds>,sig1=<hex>`. Requests older/newer than five minutes are rejected. Event identity is derived from Stream UID, `modified`, and outcome; D1 inserts it before applying an idempotent transition.

## Staging Stream configuration

Resource/binding/Access setup and credential boundaries are documented in [`cloudflare-setup.md`](cloudflare-setup.md). Do not configure production or treat local fake results as remote evidence.

Create a least-privilege Cloudflare API token with Stream read/write for the staging account, then configure Worker secrets/vars:

```sh
wrangler secret put STREAM_API_TOKEN --env staging
wrangler secret put STREAM_WEBHOOK_SECRET --env staging
wrangler secret put VIDEO_SERVICE_TOKEN --env staging
wrangler secret put R2_ACCESS_KEY_ID --env staging
wrangler secret put R2_SECRET_ACCESS_KEY --env staging
```

Set non-secret staging values in the staging Wrangler environment:

```text
STREAM_MODE=real
STREAM_ACCOUNT_ID=<account id>
STREAM_ALLOWED_ORIGIN=<staging hostname, no scheme/path>
STREAM_DELIVERY_HOST=customer-<code>.cloudflarestream.com
R2_ACCOUNT_ID=<account id>
R2_BUCKET_NAME=<private attachment bucket>
```

`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are needed only for selected historical promotion. They produce a 15-minute SigV4 R2 read URL that Stream fetches directly; the Worker does not read/proxy the object. Do not promote every historical video.

Register the account's single Stream webhook subscription and immediately store the returned secret:

```sh
curl -X PUT \
  -H "Authorization: Bearer $STREAM_API_TOKEN" \
  -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$STREAM_ACCOUNT_ID/stream/webhook" \
  --data '{"notificationUrl":"https://<staging-host>/api/stream-webhook"}'
```

Cloudflare's current documented contract differs from the original reel transcript in these material ways:

- webhooks occur after processing completes, not once for upload and again for processing;
- webhook authentication uses `Webhook-Signature` timestamped HMAC-SHA256, not a bearer secret;
- resumable direct creator creation uses `POST /stream?direct_user=true`, returns the URL in `Location`, and the UID in `stream-media-id`; `/direct_upload` returns a basic multipart POST URL;
- signed playback replaces the UID with a short-lived token in the manifest path;
- MP4 downloads must first be generated and may be `inprogress` before they are ready.

### Required staging validation

Record the release SHA, deployment URL, video/project IDs, relevant workflow runs, and pass/fail evidence outside Git. These are manual remote checks; none are proven by `npm run test:readiness`.

1. Confirm an unauthenticated request is blocked by Access.
2. Upload a video larger than 200 MB with tus, interrupt it, and confirm resume.
3. Inspect browser requests: video bytes go to `upload.videodelivery.net`, never the Worker.
4. Confirm the stored Stream video has signed URLs required, the duration limit, and allowed origin.
5. Confirm an altered/stale webhook is 401, a valid webhook transitions once, and replay is a no-op.
6. Confirm measurement yields ready state and the manifest works only with the issued 15-minute token.
7. Confirm the raw UID manifest does not play and an expired token fails.
8. Promote one selected historical private R2 video and run it through the same webhook/measurement path.
9. Run the archive workflow and verify Drive output without changing screening readiness.

Do not claim real Stream validation based on local fake results.

## Loudness measurement

The scheduled `.github/workflows/video-measure.yml` calls the service-authenticated queue, runs ffmpeg `loudnorm`, and reports integrated LUFS plus input duration. The Worker computes the only accepted gain value:

```text
gain_db = clamp(-16 - loudness_i, -12, 12)
```

Configure GitHub secrets `VIDEO_API_URL` and `VIDEO_SERVICE_TOKEN`. The service token is distinct from Access user identity and Stream credentials. Trigger manually when testing or allow the ten-minute schedule. A failed decode records `failed(measurement)` and may be retried by an authorized project user. Stream/download failures remain visible rather than entering playlists.

## Drive archive

`.github/workflows/video-archive.yml` is manual. Configure:

- secret `VIDEO_API_URL`
- secret `VIDEO_SERVICE_TOKEN`
- secret `RCLONE_CONFIG` containing the Drive remote credentials
- repository variable `RCLONE_DRIVE_DESTINATION`, such as `drive:hackweek/2026`

The job requests short-lived downloadable Stream URLs and uses `rclone copyurl --no-clobber`. Results update only `archive_status`. A failed archive remains retryable and the video remains ready for screening.

## Failure recovery

- **Upload or Stream failure:** inspect `error_message`, delete/reissue the primary upload, and resume with tus where the client still has a valid upload URL.
- **Measurement failure:** correct the source/configuration, call the authorized retry endpoint, and rerun the measurement workflow.
- **Archive failure:** correct Drive/rclone configuration and rerun the manual workflow; failed archive rows remain in its queue.
- **Webhook outage:** Cloudflare events are safe to replay because `stream_events.event_id` is unique. Do not manually write video status or gain.
- **Token/secret exposure:** rotate the affected Stream, webhook, job, or R2 credential independently. Client responses contain no API credential.

Official references validated for this implementation: Cloudflare Stream direct creator uploads, resumable uploads, webhooks, signed URLs/tokens, and downloadable MP4 documentation/API references (reviewed 2026-08-04).
