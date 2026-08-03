import {env, SELF} from 'cloudflare:test';
import {describe, expect, it} from 'vitest';

import {tableNames} from '../src/worker/db/schema';

describe('Cloudflare application foundation', () => {
  it('serves the health API from the Worker', async () => {
    const response = await SELF.fetch('https://hackweek.test/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok: true});
  });

  it('applies the normalized schema to local D1', async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{name: string}>();
    const actual = new Set(result.results.map(({name}) => name));

    expect(tableNames.every((table) => actual.has(table))).toBe(true);
  });

  it('rejects duplicate votes and self-project votes', async () => {
    await seedVotingFixture();

    await env.DB.prepare(
      `INSERT INTO votes
        (id, source_id, year_id, creator_id, project_id, award_category_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind('vote-1', 'vote-1', '2026', 'voter', 'project-1', 'category-1')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO votes
          (id, source_id, year_id, creator_id, project_id, award_category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind('vote-2', 'vote-2', '2026', 'voter', 'project-1', 'category-1')
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO votes
          (id, source_id, year_id, creator_id, project_id, award_category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind('vote-3', 'vote-3', '2026', 'member', 'project-1', 'category-1')
        .run(),
    ).rejects.toThrow('users cannot vote for their own project');
  });

  it('uses the private local R2 binding', async () => {
    const key = 'foundation/smoke.txt';
    await env.ATTACHMENTS.put(key, 'local-r2-ok');

    const object = await env.ATTACHMENTS.get(key);

    expect(object).not.toBeNull();
    expect(await object?.text()).toBe('local-r2-ok');
  });
});

async function seedVotingFixture() {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, source_uid, email, display_name)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
    ).bind(
      'creator',
      'creator',
      'creator@example.com',
      'Creator',
      'member',
      'member',
      'member@example.com',
      'Member',
      'voter',
      'voter',
      'voter@example.com',
      'Voter',
    ),
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind('2026'),
    env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind('project-1', 'project-1', '2026', 'creator', 'First project'),
    env.DB.prepare(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
    ).bind('project-1', 'member'),
    env.DB.prepare(
      `INSERT INTO award_categories
        (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind('category-1', 'category-1', '2026', 'Most delightful', 'creator'),
  ]);
}
