import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {migrationSql} from '../../scripts/migrate/import';
import {
  assertExplicitDestination,
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

  it('creates stable upsert SQL so reruns cannot duplicate source rows', async () => {
    const result = await transformFirebaseExport(await fixture('database.json'));
    const first = migrationSql(result.data);
    const second = migrationSql(result.data);

    expect(second).toBe(first);
    expect(first).toContain('ON CONFLICT(id) DO UPDATE');
    expect(first).toContain('ON CONFLICT(project_id, user_id) DO UPDATE');
    expect(first).toContain("'project-history'");
  });

  it('rejects traversal and requires explicit staging confirmation', () => {
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
    expect(() => assertExplicitDestination('staging', 'staging', undefined)).toThrow(
      /--confirm/,
    );
    expect(() => assertExplicitDestination('staging', 'staging', 'production')).toThrow(
      /--confirm/,
    );
    expect(() =>
      assertExplicitDestination('staging', 'staging', 'staging'),
    ).not.toThrow();
  });
});
