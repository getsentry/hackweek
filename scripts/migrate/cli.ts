#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {importMigration, type Destination, type ImportOptions} from './import';
import {
  assertExplicitDestination,
  destinationCounts,
  reconcileCounts,
  transformedCounts,
} from './reconcile';
import {readStorageManifest, transformFirebaseExport} from './transform';
import {entityNames, type MigrationReport} from './types';

interface Arguments {
  command: 'validate' | 'dry-run' | 'import' | 'reconcile';
  database: string;
  storageManifest?: string;
  storageRoot?: string;
  report?: string;
  target: Destination;
  environment?: string;
  confirmation?: string;
  databaseName: string;
  bucketName: string;
  config?: string;
  persistTo?: string;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  assertExplicitDestination(args.target, args.environment, args.confirmation);
  const database = JSON.parse(await readFile(args.database, 'utf8')) as unknown;
  const manifest = args.storageManifest
    ? await readStorageManifest(args.storageManifest)
    : [];
  const transformed = await transformFirebaseExport(database, manifest, args.storageRoot);
  const report: MigrationReport = {
    generatedAt: new Date().toISOString(),
    dryRun: args.command !== 'import',
    source: {
      database: path.resolve(args.database),
      storageManifest: args.storageManifest ? path.resolve(args.storageManifest) : null,
    },
    sourceCounts: transformed.sourceCounts,
    transformedCounts: transformedCounts(transformed.data),
    destinationCounts: {},
    destinationSourceCounts: {},
    storage: {
      sourceObjects: manifest.length,
      linkedObjects: transformed.data.media.filter((row) => row.status === 'available')
        .length,
      copied: 0,
      unchanged: 0,
      missing: transformed.storageObjects.filter((row) => row.status === 'missing')
        .length,
      failed: 0,
      objects: transformed.storageObjects,
    },
    issues: transformed.issues,
  };

  if (args.command === 'import') {
    if (report.issues.some((entry) => entry.severity === 'error')) {
      await output(report, args.report);
      throw new Error('Validation errors prevent import; inspect the migration report');
    }
    await importMigration(transformed.data, report, destination(args));
    const destinationResult = destinationCounts(destination(args), transformed.data);
    report.destinationCounts = destinationResult.counts;
    report.destinationSourceCounts = destinationResult.sourceCounts;
    reconcileCounts(report);
  } else if (args.command === 'reconcile') {
    const destinationResult = destinationCounts(destination(args), transformed.data);
    report.destinationCounts = destinationResult.counts;
    report.destinationSourceCounts = destinationResult.sourceCounts;
    reconcileCounts(report);
  }

  await output(report, args.report);
  if (report.issues.some((entry) => entry.severity === 'error')) process.exitCode = 1;
}

function destination(args: Arguments): ImportOptions {
  return {
    destination: args.target,
    databaseName: args.databaseName,
    bucketName: args.bucketName,
    environment: args.environment,
    config: args.config,
    persistTo: args.persistTo,
  };
}

function parseArguments(argv: string[]): Arguments {
  const command = argv.shift() as Arguments['command'] | undefined;
  if (!command || !['validate', 'dry-run', 'import', 'reconcile'].includes(command)) {
    throw new Error(
      'Usage: cli.ts <validate|dry-run|import|reconcile> --database <export.json>',
    );
  }
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined)
      throw new Error(`Invalid argument: ${flag}`);
    flags.set(flag.slice(2), value);
  }
  const database = flags.get('database') ?? flags.get('source');
  if (!database) throw new Error('--database is required');
  const target = flags.get('target') ?? 'local';
  if (target !== 'local' && target !== 'staging')
    throw new Error('--target must be local or staging');
  return {
    command,
    database,
    storageManifest: flags.get('storage-manifest'),
    storageRoot: flags.get('storage-root'),
    report: flags.get('report'),
    target,
    environment: flags.get('env'),
    confirmation: flags.get('confirm'),
    databaseName: flags.get('database-name') ?? 'hackweek-db',
    bucketName: flags.get('bucket-name') ?? 'hackweek-attachments-local',
    config: flags.get('config'),
    persistTo: flags.get('persist-to'),
  };
}

async function output(report: MigrationReport, filename?: string) {
  if (filename)
    await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600});
  const counts = entityNames
    .map((name) => `${name}=${report.transformedCounts[name]}`)
    .join(' ');
  const errors = report.issues.filter((entry) => entry.severity === 'error').length;
  const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
  console.log(`Migration ${report.dryRun ? 'dry-run' : 'import'}: ${counts}`);
  console.log(
    `Storage: source=${report.storage.sourceObjects} linked=${report.storage.linkedObjects} copied=${report.storage.copied} missing=${report.storage.missing} failed=${report.storage.failed}`,
  );
  console.log(`Issues: errors=${errors} warnings=${warnings}`);
  if (filename) console.log(`Report: ${path.resolve(filename)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
