import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
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
  return JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));
}

describe('Firebase migration transformation', () => {
  it('keeps populated legacy SQL rollback-compatible while adding the R2 lifecycle', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      for (let version = 1; version <= 6; version += 1) {
        const name = String(version).padStart(4, '0');
        const migration = await readFile(
          path.resolve(
            'migrations',
            `${name}_${
              [
                'initial',
                'access_identity',
                'voting_administration',
                'stream_video_lifecycle',
                'google_oauth_sessions',
                'session_view_mode',
              ][version - 1]
            }.sql`,
          ),
          'utf8',
        );
        database.exec(migration);
      }
      database.exec(`
        INSERT INTO users (id, source_uid, email, display_name)
        VALUES ('legacy-user', 'legacy-source', 'legacy@example.com', 'Legacy User');
        INSERT INTO years (id) VALUES ('legacy-year');
        INSERT INTO projects (id, source_id, year_id, creator_id, name)
        VALUES
          ('legacy-project', 'legacy-project', 'legacy-year', 'legacy-user', 'Legacy Project'),
          ('r2-project', 'r2-project', 'legacy-year', 'legacy-user', 'R2 Project');
        INSERT INTO media (
          id, source_id, project_id, original_name, r2_key, media_type, status
        ) VALUES (
          'legacy-media', 'legacy-media', 'legacy-project', 'legacy.mp4',
          'legacy/media.mp4', 'video/mp4', 'available'
        );
        INSERT INTO project_videos (
          id, project_id, stream_uid, source_media_id, status, duration_seconds,
          loudness_lufs, gain_db, sort_order, upload_expires_at, failure_stage,
          measurement_attempts, archive_status, archive_attempts
        ) VALUES (
          'legacy-video', 'legacy-project', 'stream-before', 'legacy-media', 'ready',
          42, -18, 2, 1, NULL, NULL, 1, 'pending', 0
        );
        INSERT INTO stream_events (event_id, stream_uid, event_type)
        VALUES ('legacy-event', 'stream-before', 'video.ready');
      `);

      const expand = await readFile(
        path.resolve('migrations/0007_r2_video_lifecycle.sql'),
        'utf8',
      );
      expect(expand).not.toMatch(/ALTER TABLE project_videos|DROP TABLE stream_events/);
      database.exec(expand);
      const progressMigration = await readFile(
        path.resolve('migrations/0008_video_processing_progress.sql'),
        'utf8',
      );
      database.exec(progressMigration);
      const nominationEligibilityMigration = await readFile(
        path.resolve('migrations/0009_nomination_vote_eligibility.sql'),
        'utf8',
      );
      database.exec(nominationEligibilityMigration);
      const nominationImmutabilityMigration = await readFile(
        path.resolve('migrations/0010_live_nomination_immutability.sql'),
        'utf8',
      );
      database.exec(nominationImmutabilityMigration);

      expect(
        database
          .prepare(`SELECT id, project_id, stream_uid, source_media_id, status,
            duration_seconds, loudness_lufs, gain_db, error_message, failure_stage,
            archive_status, archive_error FROM project_videos WHERE stream_uid = ?`)
          .get('stream-before'),
      ).toMatchObject({
        id: 'legacy-video',
        project_id: 'legacy-project',
        source_media_id: 'legacy-media',
        status: 'ready',
        duration_seconds: 42,
      });
      expect(
        database
          .prepare('SELECT event_type FROM stream_events WHERE event_id = ?')
          .get('legacy-event'),
      ).toMatchObject({event_type: 'video.ready'});

      database.exec(`
        INSERT INTO stream_events (event_id, stream_uid, event_type)
        VALUES ('rollback-event', 'stream-before', 'video.uploading');
        INSERT INTO project_videos (
          id, project_id, stream_uid, status, upload_expires_at,
          error_message, failure_stage, duration_seconds, loudness_lufs, gain_db,
          archive_status, archive_error
        ) VALUES (
          'ignored-on-conflict', 'legacy-project', 'stream-after', 'uploading',
          '2030-01-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, 'pending', NULL
        ) ON CONFLICT(project_id) DO UPDATE SET
          stream_uid = excluded.stream_uid, source_media_id = NULL, status = 'uploading',
          upload_expires_at = excluded.upload_expires_at, duration_seconds = NULL,
          loudness_lufs = NULL, gain_db = NULL, error_message = NULL,
          failure_stage = NULL, archive_status = 'pending', archive_error = NULL,
          archived_at = NULL, updated_at = CURRENT_TIMESTAMP;
      `);
      expect(
        database
          .prepare('SELECT stream_uid, status FROM project_videos WHERE project_id = ?')
          .get('legacy-project'),
      ).toMatchObject({stream_uid: 'stream-after', status: 'uploading'});
      expect(
        database.prepare('SELECT COUNT(*) count FROM stream_events').get(),
      ).toMatchObject({count: 2});

      database.exec(`
        INSERT INTO video_uploads (
          id, video_id, project_id, creator_id, r2_upload_id, original_r2_key,
          original_name, content_type, expected_size_bytes, part_size_bytes,
          status, expires_at, completed_at
        ) VALUES (
          'r2-upload', 'r2-video', 'r2-project', 'legacy-user', 'multipart-id',
          'r2/original.mp4', 'original.mp4', 'video/mp4', 11, 5242880,
          'completed', '2030-01-01T00:00:00.000Z', CURRENT_TIMESTAMP
        );
        INSERT INTO video_submissions (
          id, project_id, original_name, content_type, size_bytes, original_r2_key,
          status, processing_attempt
        ) VALUES (
          'r2-video', 'r2-project', 'original.mp4', 'video/mp4', 11,
          'r2/original.mp4', 'queued', 1
        );
        INSERT INTO video_processing_attempts (video_id, attempt, status)
        VALUES ('r2-video', 1, 'queued');
        UPDATE video_processing_attempts
        SET progress_stage = 'transcoding', progress_percent = 63
        WHERE video_id = 'r2-video' AND attempt = 1;
      `);
      expect(
        database
          .prepare(`SELECT vs.status, vs.original_r2_key, vpa.status attempt_status,
              vpa.progress_stage, vpa.progress_percent
            FROM video_submissions vs
            JOIN video_processing_attempts vpa ON vpa.video_id = vs.id
            WHERE vs.id = 'r2-video' AND vpa.attempt = 1`)
          .get(),
      ).toMatchObject({
        status: 'queued',
        original_r2_key: 'r2/original.mp4',
        attempt_status: 'queued',
        progress_stage: 'transcoding',
        progress_percent: 63,
      });
      expect(() =>
        database.exec(`UPDATE video_processing_attempts
          SET progress_percent = 101 WHERE video_id = 'r2-video' AND attempt = 1`),
      ).toThrow(/CHECK constraint failed/);
      expect(() =>
        database.exec(`INSERT INTO video_submissions (
          id, project_id, original_name, size_bytes, original_r2_key
        ) VALUES ('r2-conflict', 'r2-project', 'conflict.mp4', 5, 'r2/conflict.mp4')`),
      ).toThrow(/UNIQUE constraint failed/);
      database.exec(`
        UPDATE video_submissions SET status = 'retired', retired_at = CURRENT_TIMESTAMP
        WHERE id = 'r2-video';
        INSERT INTO video_submissions (
          id, project_id, original_name, size_bytes, original_r2_key
        ) VALUES ('r2-replacement', 'r2-project', 'replacement.mp4', 5, 'r2/replacement.mp4');
      `);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('preserves historical votes while enforcing nomination eligibility on new writes', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      const migrations = [
        '0001_initial.sql',
        '0002_access_identity.sql',
        '0003_voting_administration.sql',
        '0004_stream_video_lifecycle.sql',
        '0005_google_oauth_sessions.sql',
        '0006_session_view_mode.sql',
        '0007_r2_video_lifecycle.sql',
        '0008_video_processing_progress.sql',
      ];
      for (const migration of migrations) {
        database.exec(await readFile(path.resolve('migrations', migration), 'utf8'));
      }
      database.exec(`
        INSERT INTO users (id, source_uid, email, display_name) VALUES
          ('owner', 'owner', 'owner@example.com', 'Owner'),
          ('voter', 'voter', 'voter@example.com', 'Voter'),
          ('voter-two', 'voter-two', 'voter-two@example.com', 'Voter Two');
        INSERT INTO years (id, voting_enabled) VALUES ('2026', 1);
        INSERT INTO projects (id, source_id, year_id, creator_id, name) VALUES
          ('restricted', 'restricted', '2026', 'owner', 'Restricted'),
          ('all-categories', 'all-categories', '2026', 'owner', 'All Categories');
        INSERT INTO award_categories
          (id, source_id, year_id, name, creator_id) VALUES
          ('nominated', 'nominated', '2026', 'Nominated', 'owner'),
          ('excluded', 'excluded', '2026', 'Excluded', 'owner');
        INSERT INTO project_nominations
          (project_id, award_category_id, position)
          VALUES ('restricted', 'nominated', 1);
        INSERT INTO votes
          (id, source_id, year_id, creator_id, project_id, award_category_id)
          VALUES
          ('historical-vote', 'historical-vote', '2026', 'voter', 'restricted', 'excluded');
      `);

      database.exec(
        await readFile(
          path.resolve('migrations/0009_nomination_vote_eligibility.sql'),
          'utf8',
        ),
      );

      expect(
        database
          .prepare(
            `SELECT v.project_id, v.award_category_id, pn.position
             FROM votes v JOIN project_nominations pn
               ON pn.project_id = v.project_id
             WHERE v.id = 'historical-vote'`,
          )
          .get(),
      ).toMatchObject({
        project_id: 'restricted',
        award_category_id: 'excluded',
        position: 1,
      });

      database.exec(`
        INSERT INTO votes
          (id, source_id, year_id, creator_id, project_id, award_category_id)
          VALUES
          ('eligible-vote', 'eligible-vote', '2026', 'voter', 'restricted', 'nominated');
      `);
      expect(() =>
        database.exec(`
          INSERT INTO votes
            (id, source_id, year_id, creator_id, project_id, award_category_id)
            VALUES
            ('invalid-vote', 'invalid-vote', '2026', 'voter-two', 'restricted', 'excluded');
        `),
      ).toThrow(/vote project is not eligible for this award category/);

      database.exec(`
        UPDATE votes SET project_id = 'all-categories'
        WHERE id = 'historical-vote';
      `);
      expect(() =>
        database.exec(`
          UPDATE votes SET project_id = 'restricted'
          WHERE id = 'historical-vote';
        `),
      ).toThrow(/vote project is not eligible for this award category/);
      expect(
        database
          .prepare("SELECT project_id FROM votes WHERE id = 'historical-vote'")
          .get(),
      ).toMatchObject({project_id: 'all-categories'});
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('freezes nomination rows at the database boundary only during live voting', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      const migrations = [
        '0001_initial.sql',
        '0002_access_identity.sql',
        '0003_voting_administration.sql',
        '0004_stream_video_lifecycle.sql',
        '0005_google_oauth_sessions.sql',
        '0006_session_view_mode.sql',
        '0007_r2_video_lifecycle.sql',
        '0008_video_processing_progress.sql',
        '0009_nomination_vote_eligibility.sql',
        '0010_live_nomination_immutability.sql',
      ];
      for (const migration of migrations) {
        database.exec(await readFile(path.resolve('migrations', migration), 'utf8'));
      }
      database.exec(`
        INSERT INTO users (id, source_uid, email, display_name)
          VALUES ('owner', 'owner', 'owner@example.com', 'Owner');
        INSERT INTO years (id) VALUES ('2026');
        INSERT INTO projects (id, source_id, year_id, creator_id, name)
          VALUES ('project', 'project', '2026', 'owner', 'Project');
        INSERT INTO award_categories
          (id, source_id, year_id, name, creator_id) VALUES
          ('first', 'first', '2026', 'First', 'owner'),
          ('second', 'second', '2026', 'Second', 'owner');
        INSERT INTO project_nominations
          (project_id, award_category_id, position)
          VALUES ('project', 'first', 1);
        UPDATE project_nominations SET award_category_id = 'second'
          WHERE project_id = 'project';
        DELETE FROM project_nominations WHERE project_id = 'project';
        INSERT INTO project_nominations
          (project_id, award_category_id, position)
          VALUES ('project', 'first', 1);
        UPDATE years SET voting_enabled = 1 WHERE id = '2026';
      `);

      expect(() =>
        database.exec(`INSERT INTO project_nominations
          (project_id, award_category_id, position)
          VALUES ('project', 'second', 2)`),
      ).toThrow(/award nominations cannot change while voting is enabled/);
      expect(() =>
        database.exec(`UPDATE project_nominations SET position = 2
          WHERE project_id = 'project' AND award_category_id = 'first'`),
      ).toThrow(/award nominations cannot change while voting is enabled/);
      expect(() =>
        database.exec(`DELETE FROM project_nominations
          WHERE project_id = 'project' AND award_category_id = 'first'`),
      ).toThrow(/award nominations cannot change while voting is enabled/);
      expect(() =>
        database.exec("DELETE FROM award_categories WHERE id = 'first'"),
      ).toThrow(/award nominations cannot change while voting is enabled/);

      expect(
        database.prepare("SELECT id FROM award_categories WHERE id = 'first'").get(),
      ).toMatchObject({id: 'first'});
      expect(
        database
          .prepare(`SELECT project_id, award_category_id, position
            FROM project_nominations WHERE project_id = 'project'`)
          .get(),
      ).toMatchObject({
        project_id: 'project',
        award_category_id: 'first',
        position: 1,
      });
      database.exec(`
        INSERT INTO years (id) VALUES ('2027');
        DELETE FROM award_categories WHERE id = 'first';
      `);
      expect(
        database.prepare("SELECT id FROM award_categories WHERE id = 'first'").get(),
      ).toBeUndefined();
      expect(
        database
          .prepare(
            "SELECT project_id FROM project_nominations WHERE project_id = 'project'",
          )
          .get(),
      ).toBeUndefined();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
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
    const root: {
      years: Record<
        string,
        {
          votes: unknown;
          awards: Record<string, {name: string}>;
        }
      >;
    } = database;
    root.years['2024'].votes = '';
    const award = Object.values(root.years['2024'].awards)[0];
    award.name = '';

    const result = await transformFirebaseExport(root);

    expect(result.issues.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(result.data.votes).toEqual([]);
    expect(result.data.awards).toHaveLength(1);
    expect(result.data.awards[0].name).toBe('Impact');
  });

  it('reports and omits legacy votes that conflict with current eligibility', async () => {
    const database = await fixture('database.json');
    const root: {
      years: Record<
        string,
        {
          votes: Record<string, {creator: string; project: string}>;
        }
      >;
    } = database;
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
