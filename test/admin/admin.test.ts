import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import {signAccessToken} from '../auth/fixture';

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
    });
    expect(renamed.body.category.name).toBe('Most inventive');
  });

  it('enforces two distinct same-year nominations in validation and D1', async () => {
    const first = await createCategory('First');
    const second = await createCategory('Second');
    const third = await createCategory('Third');
    const saved = await api(`/admin/projects/${projectId}/nominations`, adminToken, {
      method: 'PUT',
      body: {categoryIds: [first.id, second.id]},
    });
    const duplicate = await api(`/admin/projects/${projectId}/nominations`, adminToken, {
      method: 'PUT',
      body: {categoryIds: [first.id, first.id]},
    });
    const tooMany = await api(`/admin/projects/${projectId}/nominations`, adminToken, {
      method: 'PUT',
      body: {categoryIds: [first.id, second.id, third.id]},
    });
    const otherYear = `${yearId}-other`;
    await env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(otherYear).run();
    const crossId = `cross-category-${sequence}`;
    await env.DB.prepare(
      `INSERT INTO award_categories (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crossId, crossId, otherYear, 'Cross', adminId)
      .run();
    const cross = await api(`/admin/projects/${projectId}/nominations`, adminToken, {
      method: 'PUT',
      body: {categoryIds: [crossId]},
    });

    expect(saved.body.nominations).toHaveLength(2);
    expect(duplicate.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(cross.body.error.message).toMatch(/nomination/);
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
  return response.body.category as {id: string};
}

async function tokenAndSession(kind: 'admin' | 'member') {
  const subject = `admin-${kind}-${sequence}`;
  const token = await signAccessToken({
    sub: subject,
    email: `${subject}@sentry.io`,
    name: kind,
  });
  await SELF.fetch(`${base}/session`, {headers: {'Cf-Access-Jwt-Assertion': token}});
  const user = await env.DB.prepare('SELECT id FROM users WHERE access_subject = ?')
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
  const response = await SELF.fetch(`${base}${path}`, {
    method: options.method,
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      ...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json<any>(),
  };
}
