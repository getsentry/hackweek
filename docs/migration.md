# Firebase database and storage migration

The migration CLI performs an operator-controlled, one-off transform from a Firebase Realtime Database JSON export and Storage export into D1 and private R2. Firebase is a source format only: the application has no Firebase SDK, deploy configuration, rules, runtime fallback, live reader, delete command, or dual-write path.

## Protect source data

Keep real exports beneath ignored `migration-input/` or outside the repository. Never commit exports, objects, company identities, service-account files, Cloudflare credentials, or generated reports. The tracked `test/fixtures/firebase` data is synthetic and uses `example.invalid` identities.

The database export is one JSON object with `users` and nested `years`. The storage manifest is:

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

`file` is relative to `--storage-root`. Absolute paths, backslashes, traversal, and normalization changes are rejected. SHA-256 is computed for every available file and compared with the manifest. IDs remain source keys; R2 keys are deterministic:

```text
projects/<project-source-id>/media/<media-source-id>/<sanitized-original-name>
```

Unknown/invalid records, missing/duplicate references, unreferenced/missing objects, counts, paths, sizes, checksums, and outcomes appear in JSON/human output. Invalid related rows are excluded and reported while unrelated valid rows remain.

## Validate and dry-run (no destination writes)

```bash
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

Resolve every error and explicitly review warnings. Dry-run never invokes D1/R2 destination commands.

## Deterministic local rehearsal

```bash
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

The second import must preserve identical source-scoped counts and R2 keys. Run `npm run test:readiness` to independently create temporary D1/R2 state, import/reconcile the fixture, and verify `Historical Telescope`, two team members, Orbit, Impact ballot/award, `poster.txt`, and the video-free `Idea Compass` through local APIs.

## Staging rehearsal

Remote writes require all three signals: `--target staging`, a named `--env`, and exact matching `--confirm`. The environment must map to reviewed staging resources.

```bash
npm run migrate:staging -- \
  --database migration-input/database.json \
  --storage-manifest migration-input/storage-manifest.json \
  --storage-root migration-input/storage \
  --database-name hackweek-db \
  --bucket-name hackweek-attachments-staging \
  --env staging --confirm staging \
  --config wrangler.staging.json \
  --report migration-output/staging-import.migration-report.json

npm run migrate:reconcile -- \
  --source migration-input/database.json \
  --storage-manifest migration-input/storage-manifest.json \
  --storage-root migration-input/storage \
  --target staging \
  --database-name hackweek-db \
  --bucket-name hackweek-attachments-staging \
  --env staging --confirm staging \
  --config wrangler.staging.json \
  --report migration-output/staging-reconcile.migration-report.json
```

Do not run these until staging bindings, Access, credentials, and approval are verified. Re-run import/reconciliation to prove idempotency, then inspect representative rendered records and authorized R2 downloads.

## Production boundary

The CLI has no production target. Final export/import requires a separately reviewed operator procedure after staging. Follow [`cutover.md`](cutover.md): announce/freeze writes, take the final export, record counts/checksums/time, dry-run and rehearse twice, import only into the approved destination, reconcile, block on mismatches, manually switch DNS, observe, and retain Firebase read-only through rollback. Only explicitly chosen historical videos move from R2 to Stream; never bulk-promote all old videos.
