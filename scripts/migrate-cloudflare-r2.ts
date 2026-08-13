#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {createHash, randomInt} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {chmod, mkdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';

import {parseWranglerJson} from './migrate/reconcile';

const execFileAsync = promisify(execFile);
const apiBase = 'https://api.cloudflare.com/client/v4';
const confirmation = 'copy-to-sentry-internal';
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js');

const source = {
  accountId: '773afa1f62ff86c80db4f24f7ff1e9c8',
  databaseId: '7063a770-b791-4fcd-aedf-ddf5fff2e312',
  name: 'Sentry Production',
};
const destination = {
  accountId: '20d94f53c7cab0b469521b703ff1923c',
  databaseId: 'c28c9eb5-7962-480e-8b3d-229fff5ca112',
  name: 'Sentry Internal',
};
const buckets = {
  attachments: 'hackweek-attachments',
  videos: 'hackweek-video-media-production',
} as const;

type BucketKind = keyof typeof buckets;
type Command =
  | 'inventory'
  | 'copy-attachments'
  | 'verify-attachments'
  | 'copy-videos'
  | 'verify-videos';

interface Arguments {
  command: Command;
  report: string;
  workDir: string;
  confirm?: string;
  keepDownloads: boolean;
  sampleSize?: number;
}

export interface R2ObjectMetadata {
  key: string;
  size: number;
  etag?: string;
  last_modified?: string;
  storage_class?: 'Standard' | 'InfrequentAccess';
  http_metadata?: {
    cacheControl?: string;
    cacheExpiry?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    contentType?: string;
  };
  custom_metadata?: Record<string, string>;
}

interface MediaRecord {
  key: string;
  size: number | null;
  sha256: string | null;
  content_type: string | null;
  status: 'available' | 'missing';
}

interface VideoRecord {
  key: string;
  kind: 'original' | 'processed';
}

interface BucketInventory {
  bucket: string;
  source: ObjectSummary;
  destination: ObjectSummary;
  sourceManifest: R2ObjectMetadata[];
  destinationManifest: R2ObjectMetadata[];
  expectedKeys: number;
  missingFromSource: string[];
  unexpectedInSource: string[];
  missingFromDestination: string[];
  unexpectedInDestination: string[];
  destinationSizeMismatches: string[];
  sourceCustomMetadataObjects: number;
  destinationCustomMetadataObjects: number;
}

interface ObjectSummary {
  objects: number;
  bytes: number;
  largestObjectBytes: number;
}

interface CopyResult {
  copied: number;
  unchanged: number;
  failed: number;
  sourceBytes: number;
  customMetadataRecordedButNotWritten: number;
  errors: Array<{index: number; message: string}>;
}

interface VerificationResult {
  verified: number;
  failed: number;
  errors: Array<{index: number; message: string}>;
}

interface Report {
  schema: 1;
  command: Command;
  generatedAt: string;
  source: typeof source;
  destination: typeof destination;
  inventory: {
    attachments: BucketInventory;
    videos: BucketInventory;
    d1: {
      availableAttachments: number;
      knownMissingAttachments: number;
      referencedVideoObjects: number;
    };
  };
  copy?: CopyResult;
  verification?: VerificationResult;
  limitations: string[];
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.command.startsWith('copy-') && args.confirm !== confirmation) {
    throw new Error(`Remote copies require --confirm ${confirmation}`);
  }

  await mkdir(path.dirname(args.report), {recursive: true, mode: 0o700});
  await mkdir(args.workDir, {recursive: true, mode: 0o700});
  await chmod(args.workDir, 0o700);

  const token = await authToken();
  const [
    media,
    videos,
    attachmentSource,
    attachmentDestination,
    videoSource,
    videoDestination,
  ] = await Promise.all([
    mediaRecords(),
    videoRecords(),
    listObjects(token, source.accountId, buckets.attachments),
    listObjects(token, destination.accountId, buckets.attachments),
    listObjects(token, source.accountId, buckets.videos),
    listObjects(token, destination.accountId, buckets.videos),
  ]);

  const availableMedia = media.filter((row) => row.status === 'available');
  const report: Report = {
    schema: 1,
    command: args.command,
    generatedAt: new Date().toISOString(),
    source,
    destination,
    inventory: {
      attachments: reconcileBucket(
        buckets.attachments,
        attachmentSource,
        attachmentDestination,
        availableMedia.map((row) => row.key),
      ),
      videos: reconcileBucket(
        buckets.videos,
        videoSource,
        videoDestination,
        videos.map((row) => row.key),
      ),
      d1: {
        availableAttachments: availableMedia.length,
        knownMissingAttachments: media.filter((row) => row.status === 'missing').length,
        referencedVideoObjects: videos.length,
      },
    },
    limitations: [
      'Wrangler object put preserves bytes, HTTP metadata, and storage class but has no custom-metadata flag.',
      'Source custom metadata is retained in this mode-0600 report but is not written to destination R2.',
      'The application does not read original-video custom metadata; derivative metadata is used only for an idempotent same-attempt write check.',
      'No command deletes source or destination objects.',
    ],
  };

  if (args.command === 'copy-attachments') {
    assertSourceInventory(report.inventory.attachments);
    report.copy = await copyObjects(
      'attachments',
      attachmentSource,
      attachmentDestination,
      new Map(availableMedia.map((row) => [row.key, row])),
      args,
    );
  } else if (args.command === 'copy-videos') {
    assertSourceInventory(report.inventory.videos);
    report.copy = await copyObjects(
      'videos',
      videoSource,
      videoDestination,
      new Map(),
      args,
    );
  } else if (args.command === 'verify-attachments') {
    report.verification = await verifyObjects(
      'attachments',
      attachmentSource,
      attachmentDestination,
      new Map(availableMedia.map((row) => [row.key, row.sha256])),
      args,
    );
  } else if (args.command === 'verify-videos') {
    report.verification = await verifyObjects(
      'videos',
      videoSource,
      videoDestination,
      new Map(),
      args,
    );
  }

  await writeSecureJson(args.report, report);
  printSummary(report, args.report);
  if (report.copy?.failed || report.verification?.failed) process.exitCode = 1;
}

function parseArguments(argv: string[]): Arguments {
  const command = argv.shift() as Command | undefined;
  const commands: Command[] = [
    'inventory',
    'copy-attachments',
    'verify-attachments',
    'copy-videos',
    'verify-videos',
  ];
  if (!command || !commands.includes(command)) {
    throw new Error(
      `Usage: tsx scripts/migrate-cloudflare-r2.ts <${commands.join('|')}>`,
    );
  }
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument: ${flag ?? '<missing>'}`);
    }
    flags.set(flag.slice(2), value);
  }
  const root = path.resolve(flags.get('work-dir') ?? 'migration-output/cloudflare-r2');
  const sample = flags.get('sample');
  const sampleSize = sample === undefined ? undefined : Number(sample);
  if (sampleSize !== undefined && (!Number.isSafeInteger(sampleSize) || sampleSize < 1)) {
    throw new Error('--sample must be a positive integer');
  }
  if (sampleSize !== undefined && !command.startsWith('verify-')) {
    throw new Error('--sample is supported only by verify commands');
  }
  return {
    command,
    report: path.resolve(
      flags.get('report') ?? `migration-output/cloudflare-r2-${command}.json`,
    ),
    workDir: root,
    confirm: flags.get('confirm'),
    keepDownloads: flags.get('keep-downloads') === 'true',
    sampleSize,
  };
}

async function authToken() {
  const output = await runWrangler(['auth', 'token', '--json']);
  const parsed = parseJsonObject(output) as {token?: string};
  if (!parsed.token) throw new Error('Wrangler did not return an OAuth token');
  return parsed.token;
}

async function mediaRecords() {
  return d1Query<MediaRecord>(
    source,
    `SELECT r2_key key, size_bytes size, sha256, media_type content_type, status
     FROM media ORDER BY r2_key`,
  );
}

async function videoRecords() {
  return d1Query<VideoRecord>(
    source,
    `SELECT original_r2_key key, 'original' kind
       FROM video_submissions WHERE original_r2_key IS NOT NULL
     UNION
     SELECT processed_r2_key key, 'processed' kind
       FROM video_submissions WHERE processed_r2_key IS NOT NULL
     ORDER BY key`,
  );
}

async function d1Query<T>(account: typeof source, sql: string) {
  const output = await runWrangler(
    ['d1', 'execute', account.databaseId, '--remote', '--command', sql, '--json'],
    account.accountId,
  );
  const parsed = parseWranglerJson(output) as Array<{success: boolean; results: T[]}>;
  if (!parsed[0]?.success) throw new Error(`D1 query failed in ${account.name}`);
  return parsed[0].results;
}

async function listObjects(token: string, accountId: string, bucket: string) {
  const objects: R2ObjectMetadata[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${apiBase}/accounts/${accountId}/r2/buckets/${bucket}/objects`);
    url.searchParams.set('per_page', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
    });
    const payload = (await response.json()) as {
      success?: boolean;
      result?: R2ObjectMetadata[];
      result_info?: {is_truncated?: boolean; cursor?: string};
      errors?: Array<{code?: number; message?: string}>;
    };
    if (!response.ok || !payload.success || !payload.result) {
      const detail = payload.errors?.map((error) => error.message).join(', ');
      throw new Error(`R2 inventory failed for ${bucket}: ${detail || response.status}`);
    }
    objects.push(...payload.result);
    cursor = payload.result_info?.is_truncated ? payload.result_info.cursor : undefined;
    if (payload.result_info?.is_truncated && !cursor) {
      throw new Error(`R2 inventory for ${bucket} was truncated without a cursor`);
    }
  } while (cursor);
  return objects.sort((left, right) => left.key.localeCompare(right.key));
}

export function reconcileBucket(
  bucket: string,
  sourceObjects: R2ObjectMetadata[],
  destinationObjects: R2ObjectMetadata[],
  expectedKeys: string[],
): BucketInventory {
  const expected = new Set(expectedKeys);
  const sourceByKey = new Map(sourceObjects.map((object) => [object.key, object]));
  const destinationByKey = new Map(
    destinationObjects.map((object) => [object.key, object]),
  );
  const sourceKeys = new Set(sourceByKey.keys());
  const destinationKeys = new Set(destinationByKey.keys());
  const shared = [...sourceKeys].filter((key) => destinationKeys.has(key));
  return {
    bucket,
    source: summarize(sourceObjects),
    destination: summarize(destinationObjects),
    sourceManifest: sourceObjects,
    destinationManifest: destinationObjects,
    expectedKeys: expected.size,
    missingFromSource: [...expected].filter((key) => !sourceKeys.has(key)).sort(),
    unexpectedInSource: [...sourceKeys].filter((key) => !expected.has(key)).sort(),
    missingFromDestination: [...sourceKeys]
      .filter((key) => !destinationKeys.has(key))
      .sort(),
    unexpectedInDestination: [...destinationKeys]
      .filter((key) => !sourceKeys.has(key))
      .sort(),
    destinationSizeMismatches: shared
      .filter((key) => sourceByKey.get(key)?.size !== destinationByKey.get(key)?.size)
      .sort(),
    sourceCustomMetadataObjects: sourceObjects.filter(
      (object) => Object.keys(object.custom_metadata ?? {}).length > 0,
    ).length,
    destinationCustomMetadataObjects: destinationObjects.filter(
      (object) => Object.keys(object.custom_metadata ?? {}).length > 0,
    ).length,
  };
}

function summarize(objects: R2ObjectMetadata[]): ObjectSummary {
  return {
    objects: objects.length,
    bytes: objects.reduce((total, object) => total + object.size, 0),
    largestObjectBytes: Math.max(0, ...objects.map((object) => object.size)),
  };
}

function assertSourceInventory(inventory: BucketInventory) {
  if (inventory.unexpectedInSource.length) {
    throw new Error(
      `${inventory.bucket} contains ${inventory.unexpectedInSource.length} unreferenced source objects; inspect inventory before copying`,
    );
  }
  if (inventory.bucket === buckets.videos && inventory.missingFromSource.length) {
    throw new Error(
      `${inventory.bucket} is missing ${inventory.missingFromSource.length} referenced video objects`,
    );
  }
}

async function copyObjects(
  kind: BucketKind,
  sourceObjects: R2ObjectMetadata[],
  destinationObjects: R2ObjectMetadata[],
  mediaByKey: Map<string, MediaRecord>,
  args: Arguments,
): Promise<CopyResult> {
  const bucket = buckets[kind];
  const destinationByKey = new Map(
    destinationObjects.map((object) => [object.key, object]),
  );
  const result: CopyResult = {
    copied: 0,
    unchanged: 0,
    failed: 0,
    sourceBytes: summarize(sourceObjects).bytes,
    customMetadataRecordedButNotWritten: sourceObjects.filter(
      (object) => Object.keys(object.custom_metadata ?? {}).length > 0,
    ).length,
    errors: [],
  };

  for (const [index, object] of sourceObjects.entries()) {
    const existing = destinationByKey.get(object.key);
    if (existing && objectMetadataMatches(object, existing)) {
      result.unchanged += 1;
      printProgress('unchanged', index + 1, sourceObjects.length);
      continue;
    }
    const filename = path.join(args.workDir, localObjectFilename(bucket, object.key));
    try {
      await runWrangler(
        [
          'r2',
          'object',
          'get',
          `${bucket}/${object.key}`,
          '--remote',
          '--file',
          filename,
        ],
        source.accountId,
      );
      const sha256 = await fileSha256(filename);
      const expected = mediaByKey.get(object.key);
      if (expected?.sha256 && sha256 !== expected.sha256) {
        throw new Error('downloaded attachment checksum does not match source D1');
      }
      if (expected?.size !== null && expected?.size !== undefined) {
        const bytes = (await stat(filename)).size;
        if (bytes !== expected.size)
          throw new Error('downloaded attachment size mismatch');
      }
      await runWrangler(
        [
          'r2',
          'object',
          'put',
          `${bucket}/${object.key}`,
          '--remote',
          '--file',
          filename,
          '--force',
          ...wranglerMetadataArgs(object),
        ],
        destination.accountId,
      );
      result.copied += 1;
      printProgress('copied', index + 1, sourceObjects.length);
    } catch (error) {
      result.failed += 1;
      result.errors.push({index: index + 1, message: errorMessage(error)});
      printProgress('failed', index + 1, sourceObjects.length);
    } finally {
      if (!args.keepDownloads) await rm(filename, {force: true});
    }
  }
  return result;
}

async function verifyObjects(
  kind: BucketKind,
  sourceObjects: R2ObjectMetadata[],
  destinationObjects: R2ObjectMetadata[],
  expectedHashes: Map<string, string | null>,
  args: Arguments,
): Promise<VerificationResult> {
  const bucket = buckets[kind];
  const destinationByKey = new Map(
    destinationObjects.map((object) => [object.key, object]),
  );
  const candidates =
    args.sampleSize === undefined
      ? sourceObjects
      : randomSample(sourceObjects, args.sampleSize);
  const result: VerificationResult = {verified: 0, failed: 0, errors: []};
  for (const [index, object] of candidates.entries()) {
    const destinationObject = destinationByKey.get(object.key);
    const sourceFile = path.join(
      args.workDir,
      `source-${localObjectFilename(bucket, object.key)}`,
    );
    const destinationFile = path.join(
      args.workDir,
      `destination-${localObjectFilename(bucket, object.key)}`,
    );
    try {
      if (!destinationObject || !objectMetadataMatches(object, destinationObject)) {
        throw new Error('destination key, size, or HTTP metadata differs from source');
      }
      await runWrangler(
        [
          'r2',
          'object',
          'get',
          `${bucket}/${object.key}`,
          '--remote',
          '--file',
          destinationFile,
        ],
        destination.accountId,
      );
      const destinationHash = await fileSha256(destinationFile);
      const expected = expectedHashes.get(object.key);
      if (expected) {
        if (destinationHash !== expected)
          throw new Error('destination checksum mismatch');
      } else {
        await runWrangler(
          [
            'r2',
            'object',
            'get',
            `${bucket}/${object.key}`,
            '--remote',
            '--file',
            sourceFile,
          ],
          source.accountId,
        );
        if ((await fileSha256(sourceFile)) !== destinationHash) {
          throw new Error('source and destination checksums differ');
        }
      }
      result.verified += 1;
      printProgress('verified', index + 1, candidates.length);
    } catch (error) {
      result.failed += 1;
      result.errors.push({index: index + 1, message: errorMessage(error)});
      printProgress('failed', index + 1, candidates.length);
    } finally {
      if (!args.keepDownloads) {
        await Promise.all([
          rm(sourceFile, {force: true}),
          rm(destinationFile, {force: true}),
        ]);
      }
    }
  }
  return result;
}

export function randomSample<T>(values: T[], size: number) {
  if (size > values.length) {
    throw new Error(`Cannot sample ${size} objects from ${values.length}`);
  }
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1);
    [shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
  }
  return shuffled.slice(0, size);
}

export function wranglerMetadataArgs(object: R2ObjectMetadata) {
  const metadata = object.http_metadata ?? {};
  const values: Array<[string, string | undefined]> = [
    ['--content-type', metadata.contentType],
    ['--content-disposition', metadata.contentDisposition],
    ['--content-encoding', metadata.contentEncoding],
    ['--content-language', metadata.contentLanguage],
    ['--cache-control', metadata.cacheControl],
    ['--expires', metadata.cacheExpiry],
    ['--storage-class', object.storage_class],
  ];
  return values.flatMap(([flag, value]) => (value ? [flag, value] : []));
}

export function objectMetadataMatches(
  sourceObject: R2ObjectMetadata,
  destinationObject: R2ObjectMetadata,
) {
  const sourceHttp = sourceObject.http_metadata ?? {};
  const destinationHttp = destinationObject.http_metadata ?? {};
  return (
    sourceObject.size === destinationObject.size &&
    sourceObject.storage_class === destinationObject.storage_class &&
    sourceHttp.contentType === destinationHttp.contentType &&
    sourceHttp.contentDisposition === destinationHttp.contentDisposition &&
    sourceHttp.contentEncoding === destinationHttp.contentEncoding &&
    sourceHttp.contentLanguage === destinationHttp.contentLanguage &&
    sourceHttp.cacheControl === destinationHttp.cacheControl &&
    sourceHttp.cacheExpiry === destinationHttp.cacheExpiry
  );
}

export function localObjectFilename(bucket: string, key: string) {
  const digest = createHash('sha256').update(`${bucket}\0${key}`).digest('hex');
  return `${digest}.object`;
}

async function fileSha256(filename: string) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filename), hash);
  return hash.digest('hex');
}

async function runWrangler(args: string[], accountId?: string) {
  const {stdout, stderr} = await execFileAsync(process.execPath, [wrangler, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: {...process.env, ...(accountId ? {CLOUDFLARE_ACCOUNT_ID: accountId} : {})},
  });
  return `${stdout}${stderr}`;
}

function parseJsonObject(output: string) {
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== '{') continue;
    try {
      return JSON.parse(output.slice(index)) as unknown;
    } catch {
      // Wrangler may prefix JSON with version output. Keep scanning.
    }
  }
  throw new Error('Wrangler did not return a JSON object');
}

async function writeSecureJson(filename: string, value: unknown) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
  await chmod(filename, 0o600);
}

function printSummary(report: Report, reportPath: string) {
  for (const kind of ['attachments', 'videos'] as const) {
    const inventory = report.inventory[kind];
    console.log(
      `${kind}: source=${inventory.source.objects} (${inventory.source.bytes} bytes) destination=${inventory.destination.objects} (${inventory.destination.bytes} bytes) expected=${inventory.expectedKeys} source-missing=${inventory.missingFromSource.length} destination-missing=${inventory.missingFromDestination.length}`,
    );
  }
  if (report.copy) {
    console.log(
      `copy: copied=${report.copy.copied} unchanged=${report.copy.unchanged} failed=${report.copy.failed}`,
    );
  }
  if (report.verification) {
    console.log(
      `verification: verified=${report.verification.verified} failed=${report.verification.failed}`,
    );
  }
  console.log(`report: ${reportPath}`);
}

function printProgress(action: string, current: number, total: number) {
  console.log(`${action}: ${current}/${total}`);
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
