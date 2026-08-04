import {describe, expect, it} from 'vitest';

import {migrationSql} from '../../scripts/migrate/import';
import {parseLocalReadinessFixture} from './readiness-fixture';

describe('seeded local cutover-readiness fixture', () => {
  it('covers the integrated user, admin, migration, media, video, and screening domains', async () => {
    const fixture = await parseLocalReadinessFixture();

    expect(fixture.users.map(({displayName}) => displayName)).toEqual([
      'Synthetic Admin',
      'Synthetic Member',
      'Synthetic Voter',
    ]);
    expect(fixture.years).toEqual([
      expect.objectContaining({id: '2024', votingEnabled: true, submissionsClosed: true}),
    ]);
    expect(fixture.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'Historical Telescope', kind: 'project'}),
        expect.objectContaining({name: 'Idea Compass', kind: 'idea'}),
      ]),
    );
    expect(fixture.projectMembers).toHaveLength(2);
    expect(fixture.media).toEqual([
      expect.objectContaining({originalName: 'poster.txt', status: 'available'}),
    ]);
    expect(fixture.votes).toHaveLength(1);
    expect(fixture.awards).toHaveLength(1);

    const sql = migrationSql(fixture);
    expect(sql).toContain('BEGIN TRANSACTION');
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE');
    expect(sql).toContain('UPDATE years SET voting_enabled=1');
    expect(sql).toContain('COMMIT');
  });
});
