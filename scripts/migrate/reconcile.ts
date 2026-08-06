import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {
  entityNames,
  type EntityName,
  type MigrationData,
  type MigrationReport,
} from './types';
import type {Destination, ImportOptions} from './import';

const tables: Record<EntityName, string> = {
  users: 'users',
  years: 'years',
  groups: 'groups',
  projects: 'projects',
  projectMembers: 'project_members',
  awardCategories: 'award_categories',
  projectNominations: 'project_nominations',
  votes: 'votes',
  awards: 'awards',
  media: 'media',
};

export function transformedCounts(data: MigrationData): Record<EntityName, number> {
  return Object.fromEntries(
    entityNames.map((name) => [name, data[name].length]),
  ) as Record<EntityName, number>;
}

export function destinationCounts(options: ImportOptions, data: MigrationData) {
  const parsed =
    options.destination === 'local'
      ? executeLocalCountQueries(options, data)
      : executeRemoteCountQueries(options, data);
  const counts: Partial<Record<EntityName, number>> = {};
  const sourceCounts: Partial<Record<EntityName, number>> = {};
  for (const {row} of parsed.flatMap(({results}) => results)) {
    const value = JSON.parse(row) as {
      entity: EntityName;
      kind: 'all' | 'source';
      count: number;
    };
    const target = value.kind === 'all' ? counts : sourceCounts;
    target[value.entity] = (target[value.entity] ?? 0) + value.count;
  }
  return {counts, sourceCounts};
}

function executeLocalCountQueries(options: ImportOptions, data: MigrationData) {
  const directory = mkdtempSync(path.join(tmpdir(), 'hackweek-reconcile-'));
  const sqlFile = path.join(directory, 'counts.sql');
  writeFileSync(sqlFile, destinationCountSql(data), {mode: 0o600});
  try {
    const output = wranglerCountCommand(options, ['--file', sqlFile]);
    return parseWranglerJson(output) as Array<{results: Array<{row: string}>}>;
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function executeRemoteCountQueries(options: ImportOptions, data: MigrationData) {
  return destinationCountStatements(data).flatMap((statement) => {
    const output = wranglerCountCommand(options, ['--command', statement]);
    return parseWranglerJson(output) as Array<{results: Array<{row: string}>}>;
  });
}

function wranglerCountCommand(options: ImportOptions, queryArgs: string[]) {
  return execFileSync(
    process.execPath,
    [
      path.resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      options.databaseName,
      options.destination === 'local' ? '--local' : '--remote',
      ...queryArgs,
      '--json',
      ...(options.environment ? ['--env', options.environment] : []),
      ...(options.destination === 'local' && options.persistTo
        ? ['--persist-to', options.persistTo]
        : []),
      ...(options.config ? ['--config', options.config] : []),
    ],
    {cwd: process.cwd(), encoding: 'utf8'},
  );
}

export function parseWranglerJson(output: string) {
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== '[' && output[index] !== '{') continue;
    try {
      return JSON.parse(output.slice(index));
    } catch {
      // Wrangler may prefix remote file execution with progress lines. Keep scanning.
    }
  }
  throw new Error('Wrangler did not return a JSON payload');
}

export function destinationCountStatements(data: MigrationData) {
  return entityNames.flatMap((name) => [
    `SELECT json_object('entity','${name}','kind','all','count',COUNT(*)) row FROM ${tables[name]}`,
    ...sourceCountQueries(name, data),
  ]);
}

export function destinationCountSql(data: MigrationData) {
  return `${destinationCountStatements(data)
    .map((statement) => `${statement};`)
    .join('\n')}\n`;
}

export function reconcileCounts(report: MigrationReport) {
  for (const name of entityNames) {
    const expected = report.transformedCounts[name];
    const actual = report.destinationSourceCounts[name];
    if (actual !== undefined && actual !== expected) {
      report.issues.push({
        severity: 'error',
        code: 'COUNT_MISMATCH',
        path: name,
        message: `expected ${expected}, destination has ${actual}`,
      });
    }
  }
}

function sourceCountQueries(name: EntityName, data: MigrationData) {
  const rows = data[name] as unknown as Array<Record<string, unknown>>;
  if (!rows.length) {
    return [`SELECT json_object('entity','${name}','kind','source','count',0) row`];
  }
  return chunks(rows, 100).map((chunk) => sourceCountQuery(name, chunk));
}

function sourceCountQuery(name: EntityName, rows: Array<Record<string, unknown>>) {
  const column =
    name === 'projectMembers' || name === 'projectNominations'
      ? null
      : name === 'years'
        ? 'id'
        : name === 'users'
          ? 'source_uid'
          : 'source_id';
  const sourceProperty =
    name === 'years' ? 'id' : name === 'users' ? 'sourceUid' : 'sourceId';
  if (column) {
    const values = rows.map((row) => `(${quote(row[sourceProperty])})`).join(',');
    return `WITH expected(value) AS (VALUES ${values})
      SELECT json_object('entity','${name}','kind','source','count',COUNT(*)) row
      FROM ${tables[name]} destination JOIN expected ON destination.${column}=expected.value`;
  }
  const secondColumn = name === 'projectMembers' ? 'user_id' : 'award_category_id';
  const secondProperty = name === 'projectMembers' ? 'userId' : 'awardCategoryId';
  const values = rows
    .map((row) => `(${quote(row.projectId)},${quote(row[secondProperty])})`)
    .join(',');
  return `WITH expected(project_id, related_id) AS (VALUES ${values})
    SELECT json_object('entity','${name}','kind','source','count',COUNT(*)) row
    FROM ${tables[name]} destination JOIN expected
      ON destination.project_id=expected.project_id
      AND destination.${secondColumn}=expected.related_id`;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({length: Math.ceil(values.length / size)}, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function quote(value: unknown) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function assertExplicitDestination(
  destination: Destination,
  environment: string | undefined,
  confirmation: string | undefined,
) {
  if (destination !== 'cloudflare') return;
  if (environment !== undefined) {
    throw new Error(
      'The single Cloudflare environment uses the reviewed top-level config; do not pass --env',
    );
  }
  if (confirmation !== 'cloudflare') {
    throw new Error('Cloudflare writes require --confirm cloudflare');
  }
}
