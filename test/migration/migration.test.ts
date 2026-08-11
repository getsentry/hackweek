import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {migrationSql} from '../../scripts/migrate/import';
import {
  assertExplicitDestination,
  destinationCountSql,
  parseWranglerJson,
  transformedCounts,
} from '../../scripts/migrate/reconcile';
import {
  deterministicR2Key,
  normalizeSourcePath,
  readStorageManifest,
  transformFirebaseExport,
} from '../../scripts/migrate/transform';

const fixtureRoot = path.resolve('test/fixtures/firebase');

async function fixture(name: string) {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8')) as unknown;
}

describe('Firebase migration transformation', () => {
  it('adds the forward R2 video history and multipart constraints', async () => {
    const sql = await readFile(
      path.resolve('migrations/0007_r2_video_lifecycle.sql'),
      'utf8',
    );

    expect(sql).toContain('ALTER TABLE project_videos RENAME TO legacy_project_videos');
    expect(sql).toContain('CREATE TABLE video_uploads');
    expect(sql).toContain('CREATE TABLE video_upload_parts');
    expect(sql).toContain('CREATE TABLE video_processing_attempts');
    expect(sql).toContain('WHERE retired_at IS NULL');
    expect(sql).toContain("status IN ('creating', 'uploading', 'completing')");
  });

  it('preserves deterministic IDs, relationships, and storage keys', async () => {
    const database = await fixture('database.json');
    const manifest = await readStorageManifest(
      path.join(fixtureRoot, 'storage-manifest.json'),
    );
    const result = await transformFirebaseExport(
      database,
      manifest,
      path.join(fixtureRoot, 'storage'),
    );

    expect(result.issues.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(transformedCounts(result.data)).toEqual({
      users: 3,
      years: 1,
      groups: 1,
      projects: 2,
      projectMembers: 2,
      awardCategories: 1,
      projectNominations: 1,
      votes: 1,
      awards: 1,
      media: 1,
    });
    expect(result.data.projects[0]).toMatchObject({
      id: 'project-history',
      sourceId: 'project-history',
      groupId: 'group-orbit',
    });
    expect(result.data.media[0]).toMatchObject({
      id: 'media-poster',
      projectId: 'project-history',
      r2Key: 'projects/project-history/media/media-poster/poster.txt',
      sizeBytes: 42,
      status: 'available',
    });
    expect(result.data.media[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reports broken relationships while retaining unrelated valid records', async () => {
    const result = await transformFirebaseExport(await fixture('edge-cases.json'));

    expect(result.data.projects).toHaveLength(1);
    expect(result.data.projects[0]).toMatchObject({id: 'valid-project', groupId: null});
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_REFERENCE',
          path: expect.stringContaining('/group'),
        }),
        expect.objectContaining({
          code: 'MISSING_REFERENCE',
          path: expect.stringContaining('/creator'),
        }),
      ]),
    );
  });

  it('accepts legacy empty collections and awards without custom names', async () => {
    const database = await fixture('database.json');
    const root = database as {
      years: Record<
        string,
        {
          votes: unknown;
          awards: Record<string, {name: string}> | string;
        }
      >;
    };
    root.years['2024'].votes = '';
    const award = Object.values(
      root.years['2024'].awards as Record<string, {name: string}>,
    )[0];
    award.name = '';

    const result = await transformFirebaseExport(root);

    expect(result.issues.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(result.data.votes).toEqual([]);
    expect(result.data.awards).toHaveLength(1);
    expect(result.data.awards[0].name).toBe('Impact');
  });

  it('reports and omits legacy votes that conflict with current eligibility', async () => {
    const database = await fixture('database.json');
    const root = database as {
      years: Record<
        string,
        {
          votes: Record<string, {creator: string; project: string}>;
        }
      >;
    };
    const vote = Object.values(root.years['2024'].votes)[0];
    vote.creator = 'user-member';
    vote.project = 'project-history';

    const result = await transformFirebaseExport(root);

    expect(result.data.votes).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'IGNORED_LEGACY_SELF_VOTE',
      }),
    );
  });

  it('creates stable destination-safe upsert SQL so reruns cannot duplicate rows', async () => {
    const result = await transformFirebaseExport(await fixture('database.json'));
    const first = migrationSql(result.data);
    const second = migrationSql(result.data);
    const cloudflare = migrationSql(result.data, 'cloudflare');

    expect(second).toBe(first);
    expect(first).toContain('BEGIN TRANSACTION;');
    expect(first).toContain('COMMIT;');
    expect(cloudflare).not.toContain('BEGIN TRANSACTION;');
    expect(cloudflare).not.toContain('COMMIT;');
    expect(first).toContain('ON CONFLICT(id) DO UPDATE');
    expect(first).toContain('ON CONFLICT(project_id, user_id) DO UPDATE');
    expect(first).toContain("'project-history'");
  });

  it('parses remote Wrangler JSON after progress output', () => {
    expect(
      parseWranglerJson(
        '├ Checking if file needs uploading\n🌀 Starting import...\n[{"results":[]} ]',
      ),
    ).toEqual([{results: []}]);
    expect(() => parseWranglerJson('no payload')).toThrow(/JSON payload/);
  });

  it('writes production-sized reconciliation queries to SQL without huge command arguments', async () => {
    const result = await transformFirebaseExport(await fixture('database.json'));
    result.data.users = Array.from({length: 700}, (_, index) => ({
      ...result.data.users[0],
      id: `user-${index}`,
      sourceUid: `source-user-${index}`,
    }));
    result.data.projectMembers = Array.from({length: 1_400}, (_, index) => ({
      projectId: `project-${index}`,
      userId: `user-${index}`,
      joinedAt: '1970-01-01T00:00:00.000Z',
    }));

    const query = destinationCountSql(result.data);

    expect(query.length).toBeGreaterThan(50_000);
    expect(query).toContain('WITH expected(value) AS (VALUES');
    expect(query).toContain('WITH expected(project_id, related_id) AS (VALUES');
    expect(query).toContain("'source-user-699'");
    expect(
      query
        .split(';\n')
        .filter((statement) => statement.includes("'kind','source'"))
        .every((statement) => statement.length < 25_000),
    ).toBe(true);
  });

  it('rejects traversal and requires explicit cloudflare confirmation', () => {
    expect(normalizeSourcePath('../secret')).toBeNull();
    expect(normalizeSourcePath('projects/p/media/m/../../secret')).toBeNull();
    expect(normalizeSourcePath('projects/p/media/m/file.png')).toBe(
      'projects/p/media/m/file.png',
    );
    expect(deterministicR2Key('p', 'm', '../../ unsafe name.png')).toBe(
      'projects/p/media/m/unsafe-name.png',
    );
    expect(deterministicR2Key('../p', 'm/slash', 'x')).toBe(
      'projects/%2e%2e%2fp/media/m%2fslash/x',
    );
    expect(() => assertExplicitDestination('cloudflare', undefined, undefined)).toThrow(
      /--confirm/,
    );
    expect(() =>
      assertExplicitDestination('cloudflare', undefined, 'production'),
    ).toThrow(/--confirm/);
    expect(() =>
      assertExplicitDestination('cloudflare', 'cloudflare', 'cloudflare'),
    ).toThrow(/do not pass --env/);
    expect(() =>
      assertExplicitDestination('cloudflare', undefined, 'cloudflare'),
    ).not.toThrow();
  });
});
