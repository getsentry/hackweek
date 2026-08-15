import {execFileSync} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {isJsonNumber, isJsonString} from '../../src/shared/json';
import type {MigrationData, MigrationReport} from './types';

export type Destination = 'local' | 'cloudflare';

export interface ImportOptions {
  destination: Destination;
  databaseName: string;
  bucketName: string;
  environment?: string;
  config?: string;
  persistTo?: string;
}

export async function importMigration(
  data: MigrationData,
  report: MigrationReport,
  options: ImportOptions,
) {
  const temp = await mkdtemp(path.join(tmpdir(), 'hackweek-migrate-'));
  try {
    for (const media of data.media) {
      const object = report.storage.objects.find((entry) => entry.mediaId === media.id);
      if (!media.storageFile) {
        media.status = 'missing';
        if (object) object.status = 'missing';
        continue;
      }
      try {
        wrangler(
          [
            'r2',
            'object',
            'put',
            `${options.bucketName}/${media.r2Key}`,
            destinationFlag(options.destination),
            '--file',
            media.storageFile,
            ...(media.mediaType ? ['--content-type', media.mediaType] : []),
            ...environmentArgs(options),
            ...persistenceArgs(options),
          ],
          options.config,
        );
        media.status = 'available';
        report.storage.copied += 1;
        if (object) object.status = 'copied';
      } catch (error) {
        media.status = 'missing';
        report.storage.failed += 1;
        if (object) object.status = 'failed';
        report.issues.push({
          severity: 'error',
          code: 'R2_COPY_FAILED',
          path: media.sourcePath,
          message: commandError(error),
        });
      }
    }

    const sqlFile = path.join(temp, 'import.sql');
    await writeFile(sqlFile, migrationSql(data, options.destination), {mode: 0o600});
    wrangler(
      [
        'd1',
        'execute',
        options.databaseName,
        destinationFlag(options.destination),
        '--file',
        sqlFile,
        '--yes',
        ...environmentArgs(options),
        ...persistenceArgs(options),
      ],
      options.config,
    );
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
}

export function migrationSql(data: MigrationData, destination: Destination = 'local') {
  const statements = [
    'PRAGMA foreign_keys = ON;',
    ...(destination === 'local' ? ['BEGIN TRANSACTION;'] : []),
  ];
  for (const row of data.users) {
    statements.push(sql`INSERT INTO users
      (id, source_uid, email, display_name, avatar_url, is_admin, created_at, updated_at)
      VALUES (${row.id}, ${row.sourceUid}, ${row.email}, ${row.displayName}, ${row.avatarUrl}, ${Number(row.isAdmin)}, ${row.createdAt}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_uid=excluded.source_uid, email=excluded.email,
      display_name=excluded.display_name, avatar_url=excluded.avatar_url,
      is_admin=excluded.is_admin, updated_at=excluded.updated_at;`);
  }
  for (const row of data.years) {
    statements.push(sql`INSERT INTO years
      (id, voting_enabled, submissions_closed) VALUES (${row.id}, 1, ${Number(row.submissionsClosed)})
      ON CONFLICT(id) DO UPDATE SET voting_enabled=1,
      submissions_closed=excluded.submissions_closed, updated_at=CURRENT_TIMESTAMP;`);
  }
  for (const row of data.groups) {
    statements.push(sql`INSERT INTO groups
      (id, source_id, year_id, name, creator_id, created_at, updated_at)
      VALUES (${row.id}, ${row.sourceId}, ${row.yearId}, ${row.name}, ${row.creatorId}, ${row.createdAt}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, year_id=excluded.year_id,
      name=excluded.name, creator_id=excluded.creator_id, updated_at=excluded.updated_at;`);
  }
  for (const row of data.projects) {
    statements.push(sql`INSERT INTO projects
      (id, source_id, year_id, creator_id, group_id, name, summary, repository,
       kind, needs_help, help_details, created_at, updated_at)
      VALUES (${row.id}, ${row.sourceId}, ${row.yearId}, ${row.creatorId}, ${row.groupId},
       ${row.name}, ${row.summary}, ${row.repository}, ${row.kind}, ${Number(row.needsHelp)},
       ${row.helpDetails}, ${row.createdAt}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, year_id=excluded.year_id,
      creator_id=excluded.creator_id, group_id=excluded.group_id, name=excluded.name,
      summary=excluded.summary, repository=excluded.repository, kind=excluded.kind,
      needs_help=excluded.needs_help, help_details=excluded.help_details,
      updated_at=excluded.updated_at;`);
  }
  for (const row of data.projectMembers) {
    statements.push(sql`INSERT INTO project_members (project_id, user_id, joined_at)
      VALUES (${row.projectId}, ${row.userId}, ${row.joinedAt})
      ON CONFLICT(project_id, user_id) DO UPDATE SET joined_at=excluded.joined_at;`);
  }
  for (const row of data.awardCategories) {
    statements.push(sql`INSERT INTO award_categories
      (id, source_id, year_id, name, creator_id, created_at, updated_at)
      VALUES (${row.id}, ${row.sourceId}, ${row.yearId}, ${row.name}, ${row.creatorId},
       ${row.createdAt}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, year_id=excluded.year_id,
      name=excluded.name, creator_id=excluded.creator_id, updated_at=excluded.updated_at;`);
  }
  for (const row of data.projectNominations) {
    statements.push(sql`INSERT INTO project_nominations
      (project_id, award_category_id, position)
      VALUES (${row.projectId}, ${row.awardCategoryId}, ${row.position})
      ON CONFLICT(project_id, award_category_id) DO UPDATE SET position=excluded.position;`);
  }
  for (const row of data.votes) {
    statements.push(sql`INSERT INTO votes
      (id, source_id, year_id, creator_id, project_id, award_category_id, created_at)
      VALUES (${row.id}, ${row.sourceId}, ${row.yearId}, ${row.creatorId}, ${row.projectId},
       ${row.awardCategoryId}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, year_id=excluded.year_id,
      creator_id=excluded.creator_id, project_id=excluded.project_id,
      award_category_id=excluded.award_category_id, created_at=excluded.created_at;`);
  }
  for (const row of data.awards) {
    statements.push(sql`INSERT INTO awards
      (id, source_id, year_id, project_id, category_id, name, creator_id,
       created_at, updated_at)
      VALUES (${row.id}, ${row.sourceId}, ${row.yearId}, ${row.projectId},
       ${row.categoryId}, ${row.name}, ${row.creatorId}, ${row.createdAt}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, year_id=excluded.year_id,
      project_id=excluded.project_id, category_id=excluded.category_id,
      name=excluded.name, creator_id=excluded.creator_id, updated_at=excluded.updated_at;`);
  }
  for (const row of data.media) {
    statements.push(sql`INSERT INTO media
      (id, source_id, project_id, original_name, r2_key, media_type, size_bytes,
       sha256, status, created_at, updated_at)
      VALUES (${row.id}, ${row.sourceId}, ${row.projectId}, ${row.originalName}, ${row.r2Key},
       ${row.mediaType}, ${row.sizeBytes}, ${row.sha256}, ${row.status},
       ${row.createdAt}, ${row.createdAt})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,
      project_id=excluded.project_id, original_name=excluded.original_name,
      r2_key=excluded.r2_key, media_type=excluded.media_type, size_bytes=excluded.size_bytes,
      sha256=excluded.sha256, status=excluded.status, updated_at=excluded.updated_at;`);
  }
  for (const row of data.years) {
    statements.push(sql`UPDATE years SET voting_enabled=${Number(row.votingEnabled)},
      submissions_closed=${Number(row.submissionsClosed)} WHERE id=${row.id};`);
  }
  if (destination === 'local') statements.push('COMMIT;');
  return `${statements.join('\n')}\n`;
}

type SqlValue = boolean | null | number | string | undefined;

function sql(strings: TemplateStringsArray, ...values: SqlValue[]) {
  return strings.reduce(
    (result, part, index) =>
      result + part + (index < values.length ? quote(values[index]) : ''),
    '',
  );
}

function quote(value: SqlValue) {
  if (value === null || value === undefined) return 'NULL';
  if (isJsonNumber(value)) return String(value);
  if (!isJsonString(value)) throw new TypeError('SQL values must be strings or numbers');
  return `'${value.replaceAll("'", "''")}'`;
}

function destinationFlag(destination: Destination) {
  return destination === 'local' ? '--local' : '--remote';
}

function environmentArgs(options: ImportOptions) {
  return options.destination === 'cloudflare' && options.environment
    ? ['--env', options.environment]
    : [];
}

function persistenceArgs(options: ImportOptions) {
  return options.destination === 'local' && options.persistTo
    ? ['--persist-to', options.persistTo]
    : [];
}

function wrangler(args: string[], config?: string) {
  execFileSync(
    process.execPath,
    [
      path.resolve('node_modules/wrangler/bin/wrangler.js'),
      ...args,
      ...(config ? ['--config', config] : []),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function commandError(cause: unknown) {
  if (cause instanceof Error && 'stderr' in cause) return String(cause.stderr).trim();
  return cause instanceof Error ? cause.message : String(cause);
}
