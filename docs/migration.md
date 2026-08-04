# Firebase database and storage migration

This tooling performs an operator-controlled, one-off transform from a Firebase Realtime Database JSON export and a Firebase Storage export into D1 and private R2. It never reads live Firebase, deletes destination data, changes DNS, or provides dual writes.

## Input safety

Put real exports beneath ignored `migration-input/` (or outside the repository). Never commit exports, media, company email addresses, service-account files, Cloudflare credentials, reports containing source paths, or `.dev.vars`. The tracked fixtures in `test/fixtures/firebase/` are synthetic and use `example.invalid` identities.

Export the Realtime Database as one JSON object with `users` and nested `years`. Produce a storage manifest as a JSON array:

```json
[
  {
    "path": "projects/<project-id>/media/<media-id>/<filename>",
    "file": "projects/<project-id>/media/<media-id>/<filename>",
    "size": 123,
    "sha256": "optional-64-character-hex",
    "contentType": "image/png"
  }
]
```

`path` is the Firebase Storage object path recorded by Realtime Database. `file` is relative to `--storage-root`. Absolute paths, backslashes, normalization changes, and traversal are rejected. The importer computes SHA-256 from each available local file and reports mismatches.

## Validate and dry-run

Validation and dry-run perform **no destination writes**:

```sh
npm run migrate:validate -- \
  --database migration-input/database.json \
  --storage-manifest migration-input/storage-manifest.json \
  --storage-root migration-input/storage

mkdir -p migration-output
npm run migrate:dry-run -- \
  --database migration-input/database.json \
  --storage-manifest migration-input/storage-manifest.json \
  --storage-root migration-input/storage \
  --report migration-output/dry-run.migration-report.json
```

The JSON report has source and transformed counts; invalid records; missing and duplicate references; unreferenced or missing objects; and per-object source path, deterministic R2 key, size, checksum, linkage, and outcome. Invalid related rows are excluded and reported; unrelated valid records continue through transformation. Inspect every error and warning before import.

IDs are the Firebase keys. R2 keys are deterministic and match the application attachment contract:

```text
projects/<project-source-id>/media/<media-source-id>/<sanitized-original-name>
```

## Local rehearsal

Start from an intentionally disposable local Wrangler state, apply migrations, import twice, and reconcile:

```sh
rm -rf .wrangler/state
npm run db:migrate:local

npm run migrate:local -- \
  --database test/fixtures/firebase/database.json \
  --storage-manifest test/fixtures/firebase/storage-manifest.json \
  --storage-root test/fixtures/firebase/storage \
  --report migration-output/local-first.migration-report.json

npm run migrate:local -- \
  --database test/fixtures/firebase/database.json \
  --storage-manifest test/fixtures/firebase/storage-manifest.json \
  --storage-root test/fixtures/firebase/storage \
  --report migration-output/local-second.migration-report.json

npm run migrate:reconcile -- \
  --source test/fixtures/firebase/database.json \
  --storage-manifest test/fixtures/firebase/storage-manifest.json \
  --storage-root test/fixtures/firebase/storage \
  --target local \
  --report migration-output/local-reconcile.migration-report.json
```

The second run uses upserts and the same R2 keys; D1 counts and keys must be identical. Validate the historical route through the local application: sign in with the explicit local fixture identity, open `/years/2024/projects`, then the `Historical Telescope` project. Confirm both synthetic members, Orbit group, award/vote administration data, and the downloadable `poster.txt` attachment. The fixture also proves an idea without media/video remains browseable.

## Staging rehearsal

Remote writes are permitted only when the operator selects `--target staging`, supplies a Wrangler `--env`, and repeats that exact environment in `--confirm`. This prevents an omitted or ambiguous environment from becoming a remote write. The environment must map `hackweek-db` and the bucket name to staging resources in the selected Wrangler config.

```sh
npm run migrate:staging -- \
  --database migration-input/database.json \
  --storage-manifest migration-input/storage-manifest.json \
  --storage-root migration-input/storage \
  --database-name hackweek-db \
  --bucket-name hackweek-attachments-staging \
  --env staging \
  --confirm staging \
  --report migration-output/staging-import.migration-report.json

npm run migrate:reconcile -- \
  --source migration-input/database.json \
  --storage-manifest migration-input/storage-manifest.json \
  --target staging \
  --database-name hackweek-db \
  --bucket-name hackweek-attachments-staging \
  --env staging \
  --confirm staging \
  --report migration-output/staging-reconcile.migration-report.json
```

Do not use staging commands until account/binding setup is separately verified. This repository does not contain or execute a production environment command.

## Final operator-assisted migration checklist

1. Announce the maintenance window and stop Firebase writes through the existing operational control.
2. Export Realtime Database JSON and Storage objects/manifests to ignored encrypted operator storage.
3. Record export time, byte/object counts, and checksums outside Git.
4. Validate and inspect every report issue. Resolve errors; explicitly accept/document warnings.
5. Rehearse the exact export locally, twice, and verify identical counts/keys.
6. Import to staging with explicit environment confirmation; reconcile counts, references, paths, sizes, checksums, and rendered historical records.
7. Only with the human operator, prepare a separately configured production Wrangler environment and repeat dry-run review before any write. Commands and credentials remain operator-held.
8. Block cutover if there is any unexplained count mismatch, checksum failure, invalid critical relationship, missing expected attachment, authorization failure, or representative rendering failure.
9. Rollback means keeping Firebase/DNS unchanged and deleting/recreating only the disposable Cloudflare destination resources through an explicit human-approved operational procedure. The migration CLI never deletes data.
10. DNS switching is manual and outside this tool. Keep Firebase exports and the old deployment until post-cutover verification and the agreed retention period complete.
