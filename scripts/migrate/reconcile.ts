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

const tables = {
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
} satisfies Record<EntityName, string>;

export function transformedCounts(data: MigrationData) {
  return {
    users: data.users.length,
    years: data.years.length,
    groups: data.groups.length,
    projects: data.projects.length,
    projectMembers: data.projectMembers.length,
    awardCategories: data.awardCategories.length,
    projectNominations: data.projectNominations.length,
    votes: data.votes.length,
    awards: data.awards.length,
    media: data.media.length,
  } satisfies Record<EntityName, number>;
}

export function destinationCounts(options: ImportOptions, data: MigrationData) {
  const parsed =
    options.destination === 'local'
      ? executeLocalCountQueries(options, data)
      : executeRemoteCountQueries(options, data);
  const counts: Partial<Record<EntityName, number>> = {};
  const sourceCounts: Partial<Record<EntityName, number>> = {};
  for (const {row} of parsed.flatMap(({results}) => results)) {
    const value: {
      entity: EntityName;
      kind: 'all' | 'source';
      count: number;
    } = JSON.parse(row);
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
    const parsed: Array<{results: Array<{row: string}>}> = parseWranglerJson(output);
    return parsed;
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function executeRemoteCountQueries(options: ImportOptions, data: MigrationData) {
  return destinationCountStatements(data).flatMap((statement) => {
    const output = wranglerCountCommand(options, ['--command', statement]);
    const parsed: Array<{results: Array<{row: string}>}> = parseWranglerJson(output);
    return parsed;
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

function sourceCountQueries(name: EntityName, data: MigrationData): string[] {
  switch (name) {
    case 'users':
      return singleSourceCountQueries(
        name,
        'source_uid',
        data.users.map((row) => row.sourceUid),
      );
    case 'years':
      return singleSourceCountQueries(
        name,
        'id',
        data.years.map((row) => row.id),
      );
    case 'groups':
      return singleSourceCountQueries(
        name,
        'source_id',
        data.groups.map((row) => row.sourceId),
      );
    case 'projects':
      return singleSourceCountQueries(
        name,
        'source_id',
        data.projects.map((row) => row.sourceId),
      );
    case 'projectMembers':
      return pairSourceCountQueries(
        name,
        'user_id',
        data.projectMembers.map((row) => [row.projectId, row.userId]),
      );
    case 'awardCategories':
      return singleSourceCountQueries(
        name,
        'source_id',
        data.awardCategories.map((row) => row.sourceId),
      );
    case 'projectNominations':
      return pairSourceCountQueries(
        name,
        'award_category_id',
        data.projectNominations.map((row) => [row.projectId, row.awardCategoryId]),
      );
    case 'votes':
      return singleSourceCountQueries(
        name,
        'source_id',
        data.votes.map((row) => row.sourceId),
      );
    case 'awards':
      return singleSourceCountQueries(
        name,
        'source_id',
        data.awards.map((row) => row.sourceId),
      );
    case 'media':
      return singleSourceCountQueries(
        name,
        'source_id',
        data.media.map((row) => row.sourceId),
      );
  }
}

function singleSourceCountQueries(name: EntityName, column: string, values: string[]) {
  if (!values.length) return [emptySourceCountQuery(name)];
  return chunks(values, 100).map((chunk) => {
    const expected = chunk.map((value) => `(${quote(value)})`).join(',');
    return `WITH expected(value) AS (VALUES ${expected})
      SELECT json_object('entity','${name}','kind','source','count',COUNT(*)) row
      FROM ${tables[name]} destination JOIN expected ON destination.${column}=expected.value`;
  });
}

function pairSourceCountQueries(
  name: EntityName,
  secondColumn: string,
  values: Array<[string, string]>,
) {
  if (!values.length) return [emptySourceCountQuery(name)];
  return chunks(values, 100).map((chunk) => {
    const expected = chunk
      .map(([projectId, relatedId]) => `(${quote(projectId)},${quote(relatedId)})`)
      .join(',');
    return `WITH expected(project_id, related_id) AS (VALUES ${expected})
      SELECT json_object('entity','${name}','kind','source','count',COUNT(*)) row
      FROM ${tables[name]} destination JOIN expected
        ON destination.project_id=expected.project_id
        AND destination.${secondColumn}=expected.related_id`;
  });
}

function emptySourceCountQuery(name: EntityName) {
  return `SELECT json_object('entity','${name}','kind','source','count',0) row`;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({length: Math.ceil(values.length / size)}, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function quote<T>(value: T) {
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
