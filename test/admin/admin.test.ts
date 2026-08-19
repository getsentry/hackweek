import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import {createSessionCookie} from '../auth/fixture';

const base = 'https://hackweek.test/api';
let sequence = 0;
let yearId: string;
let adminToken: string;
let memberToken: string;
let adminId: string;
let projectId: string;
let projectTwoId: string;

beforeEach(async () => {
  sequence += 1;
  yearId = `admin-year-${sequence}`;
  adminToken = await tokenAndSession('admin');
  memberToken = await tokenAndSession('member');
  await env.DB.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').bind(adminId).run();
  projectId = `admin-project-${sequence}`;
  projectTwoId = `admin-project-2-${sequence}`;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(yearId),
    env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    ).bind(
      projectId,
      projectId,
      yearId,
      adminId,
      'First screening',
      projectTwoId,
      projectTwoId,
      yearId,
      adminId,
      'Second screening',
    ),
  ]);
});

describe('year and award administration', () => {
  it('rejects every member administration route', async () => {
    const responses = await Promise.all([
      api(`/admin/years/${yearId}`, memberToken),
      api(`/admin/analytics?year=${yearId}`, memberToken),
      api(`/admin/years/${yearId}/categories`, memberToken, {
        method: 'POST',
        body: {name: 'No'},
      }),
      api(`/admin/awards/years/${yearId}`, memberToken, {
        method: 'POST',
        body: {name: 'No', projectId, categoryId: 'no'},
      }),
    ]);
    expect(responses.map(({status}) => status)).toEqual([403, 403, 403, 403]);
  });

  it('manages year state and categories through the centralized admin role', async () => {
    const updated = await api(`/admin/years/${yearId}`, adminToken, {
      method: 'PUT',
      body: {votingEnabled: true, submissionsClosed: true},
    });
    const category = await createCategory('Inventive');
    const renamed = await api(`/admin/categories/${category.id}`, adminToken, {
      method: 'PUT',
      body: {name: 'Most inventive'},
    });

    expect(updated.body.year).toMatchObject({
      votingEnabled: true,
      submissionsClosed: true,
      isCurrent: true,
    });
    expect(renamed.body.category.name).toBe('Most inventive');
  });

  it('keeps a live nominated category intact when deletion would change eligibility', async () => {
    const category = await createCategory('Only nomination');
    await env.DB.prepare(
      `INSERT INTO project_nominations
        (project_id, award_category_id, position) VALUES (?, ?, 1)`,
    )
      .bind(projectId, category.id)
      .run();
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();

    const deleted = await api(`/admin/categories/${category.id}`, adminToken, {
      method: 'DELETE',
    });
    const storedCategory = await env.DB.prepare(
      'SELECT id FROM award_categories WHERE id = ?',
    )
      .bind(category.id)
      .first<{id: string}>();
    const storedNomination = await env.DB.prepare(
      `SELECT project_id, award_category_id FROM project_nominations
       WHERE project_id = ? AND award_category_id = ?`,
    )
      .bind(projectId, category.id)
      .first<{project_id: string; award_category_id: string}>();

    expect(deleted).toMatchObject({
      status: 409,
      body: {
        error: {
          code: 'CONFLICT',
          message:
            'Category cannot be deleted while voting is open because a project nominated it',
        },
      },
    });
    expect(storedCategory).toEqual({id: category.id});
    expect(storedNomination).toEqual({
      project_id: projectId,
      award_category_id: category.id,
    });
  });

  it('stores archived year settings while returning their effective locked state', async () => {
    const archivedYearId = `admin-archive-${sequence}`;
    await env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(archivedYearId).run();

    const updated = await api(`/admin/years/${archivedYearId}`, adminToken, {
      method: 'PUT',
      body: {votingEnabled: true, submissionsClosed: false},
    });
    const stored = await env.DB.prepare(
      'SELECT voting_enabled, submissions_closed FROM years WHERE id = ?',
    )
      .bind(archivedYearId)
      .first<{voting_enabled: number; submissions_closed: number}>();

    expect(updated.body.year).toMatchObject({
      votingEnabled: false,
      submissionsClosed: true,
      isCurrent: false,
    });
    expect(stored).toEqual({voting_enabled: 1, submissions_closed: 0});
  });

  it('does not expose project nomination administration', async () => {
    const category = await createCategory('Unused nomination');
    const response = await SELF.fetch(`${base}/admin/projects/${projectId}/nominations`, {
      method: 'PUT',
      headers: {
        Cookie: adminToken,
        Origin: 'https://hackweek.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({categoryIds: [category.id]}),
    });
    const state = await api(`/admin/years/${yearId}`, adminToken);
    const nomination = await env.DB.prepare(
      'SELECT project_id FROM project_nominations WHERE project_id = ?',
    )
      .bind(projectId)
      .first();

    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(nomination).toBeNull();
    expect(state.body.projects[0]).not.toHaveProperty('nominations');
  });

  it('creates one same-year award per category and rejects invalid references', async () => {
    const category = await createCategory('Popular');
    const created = await api(`/admin/awards/years/${yearId}`, adminToken, {
      method: 'POST',
      body: {name: 'People’s choice', projectId, categoryId: category.id},
    });
    const duplicate = await api(`/admin/awards/years/${yearId}`, adminToken, {
      method: 'POST',
      body: {name: 'Duplicate', projectId: projectTwoId, categoryId: category.id},
    });
    const invalid = await api(`/admin/awards/${created.body.award.id}`, adminToken, {
      method: 'PUT',
      body: {name: 'Bad', projectId: 'missing', categoryId: category.id},
    });

    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(invalid.status).toBe(400);
  });

  it('stores a deterministic, complete-or-empty screening order without videos', async () => {
    const saved = await api(`/admin/years/${yearId}/screening-order`, adminToken, {
      method: 'PUT',
      body: {projectIds: [projectTwoId, projectId]},
    });
    const duplicate = await api(`/admin/years/${yearId}/screening-order`, adminToken, {
      method: 'PUT',
      body: {projectIds: [projectId, projectId]},
    });
    const state = await api(`/admin/years/${yearId}`, adminToken);

    expect(
      saved.body.screeningOrder.map((item: {projectId: string}) => item.projectId),
    ).toEqual([projectTwoId, projectId]);
    expect(duplicate.status).toBe(400);
    expect(state.body.screeningOrder).toHaveLength(2);
  });

  it('serves aggregate year and vote analytics rather than raw records', async () => {
    const category = await createCategory('Data');
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();
    const vote = await api('/votes', memberToken, {
      method: 'POST',
      body: {yearId, projectId, categoryId: category.id},
    });
    expect(vote.status).toBe(201);

    const analytics = await api(`/admin/analytics?year=${yearId}`, adminToken);
    expect(analytics.body.years).toContainEqual(
      expect.objectContaining({
        yearId,
        activeVoters: 1,
        voteCount: 1,
        projectCount: 2,
      }),
    );
    expect(analytics.body.voteResults).toEqual([
      expect.objectContaining({projectId, categoryId: category.id, voteCount: 1}),
    ]);
    expect(JSON.stringify(analytics.body)).not.toContain('creatorId');
  });
});

async function createCategory(name: string) {
  const response = await api(`/admin/years/${yearId}/categories`, adminToken, {
    method: 'POST',
    body: {name},
  });
  expect(response.status).toBe(201);
  const category: {id: string} = response.body.category;
  return category;
}

async function tokenAndSession(kind: 'admin' | 'member') {
  const subject = `admin-${kind}-${sequence}`;
  const token = await createSessionCookie({
    sub: subject,
    email: `${subject}@sentry.io`,
    name: kind,
  });
  await SELF.fetch(`${base}/session`, {headers: {Cookie: token}});
  const user = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(subject)
    .first<{id: string}>();
  if (kind === 'admin') adminId = user!.id;
  return token;
}

async function api(
  path: string,
  token: string,
  options: {method?: string; body?: unknown} = {},
) {
  const headers = new Headers({Cookie: token});
  if (options.method && options.method !== 'GET') {
    headers.set('Origin', 'https://hackweek.test');
  }
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await SELF.fetch(`${base}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json<any>(),
  };
}
