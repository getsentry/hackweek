import {execFileSync} from 'node:child_process';
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
  const query = entityNames
    .flatMap((name) => [
      `SELECT json_object('entity','${name}','kind','all','count',COUNT(*)) row FROM ${tables[name]}`,
      sourceCountQuery(name, data),
    ])
    .join('; ');
  const output = execFileSync(
    process.execPath,
    [
      path.resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      options.databaseName,
      options.destination === 'local' ? '--local' : '--remote',
      '--command',
      query,
      '--json',
      ...(options.environment ? ['--env', options.environment] : []),
      ...(options.destination === 'local' && options.persistTo
        ? ['--persist-to', options.persistTo]
        : []),
      ...(options.config ? ['--config', options.config] : []),
    ],
    {cwd: process.cwd(), encoding: 'utf8'},
  );
  const parsed = JSON.parse(output) as Array<{
    results: Array<{row: string}>;
  }>;
  const counts: Partial<Record<EntityName, number>> = {};
  const sourceCounts: Partial<Record<EntityName, number>> = {};
  for (const {row} of parsed.flatMap(({results}) => results)) {
    const value = JSON.parse(row) as {
      entity: EntityName;
      kind: 'all' | 'source';
      count: number;
    };
    (value.kind === 'all' ? counts : sourceCounts)[value.entity] = value.count;
  }
  return {counts, sourceCounts};
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

function sourceCountQuery(name: EntityName, data: MigrationData) {
  const rows = data[name] as unknown as Array<Record<string, unknown>>;
  if (!rows.length) {
    return `SELECT json_object('entity','${name}','kind','source','count',0) row`;
  }
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
  const predicate = column
    ? `${column} IN (${rows.map((row) => quote(row[sourceProperty])).join(',')})`
    : name === 'projectMembers'
      ? rows
          .map(
            (row) =>
              `(project_id=${quote(row.projectId)} AND user_id=${quote(row.userId)})`,
          )
          .join(' OR ')
      : rows
          .map(
            (row) =>
              `(project_id=${quote(row.projectId)} AND award_category_id=${quote(row.awardCategoryId)})`,
          )
          .join(' OR ');
  return `SELECT json_object('entity','${name}','kind','source','count',COUNT(*)) row FROM ${tables[name]} WHERE ${predicate}`;
}

function quote(value: unknown) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function assertExplicitDestination(
  destination: Destination,
  environment: string | undefined,
  confirmation: string | undefined,
) {
  if (destination === 'staging' && (!environment || confirmation !== environment)) {
    throw new Error(
      'Staging requires both --env <environment> and --confirm <same-environment>',
    );
  }
}
