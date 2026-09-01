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
      api('/admin/analytics/export', memberToken, {raw: true}),
      api(`/admin/analytics/export?year=${yearId}`, memberToken, {raw: true}),
      api(`/admin/years/${yearId}/categories`, memberToken, {
        method: 'POST',
        body: {name: 'No'},
      }),
      api(`/admin/awards/years/${yearId}`, memberToken, {
        method: 'POST',
        body: {name: 'No', projectId, categoryId: 'no'},
      }),
    ]);
    expect(responses.map(({status}) => status)).toEqual([403, 403, 403, 403, 403, 403]);
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
    await env.DB.batch([
      env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?').bind(yearId),
      env.DB.prepare(
        'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
      ).bind(projectId, adminId),
    ]);
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
      expect.objectContaining({
        projectId,
        categoryId: category.id,
        voteCount: 1,
        members: [expect.objectContaining({id: adminId, displayName: 'admin'})],
      }),
    ]);
    expect(JSON.stringify(analytics.body)).not.toContain('creatorId');
  });

  it('exports year metrics and project analytics CSVs without requiring ready videos', async () => {
    const category = await createCategory('Delight');
    const secondCategory = await createCategory('Craft');
    const secondVoterToken = await extraVoterToken('second');
    const thirdVoterToken = await extraVoterToken('third');
    const noVideoId = `admin-project-novid-${sequence}`;
    const failedVideoProjectId = `admin-project-failed-${sequence}`;
    const ideaId = `admin-idea-${sequence}`;
    await env.DB.batch([
      env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?').bind(yearId),
      env.DB.prepare(`UPDATE projects SET summary = ? WHERE id = ?`).bind(
        'A punchy demo, with commas',
        projectId,
      ),
      env.DB.prepare(
        `INSERT INTO projects (id, source_id, year_id, creator_id, name, summary, kind)
         VALUES (?, ?, ?, ?, ?, ?, 'project'), (?, ?, ?, ?, ?, ?, 'project'),
                (?, ?, ?, ?, ?, ?, 'idea')`,
      ).bind(
        noVideoId,
        noVideoId,
        yearId,
        adminId,
        'No ready video',
        'Still useful archive material',
        failedVideoProjectId,
        failedVideoProjectId,
        yearId,
        adminId,
        'Failed video project',
        'Failed media only',
        ideaId,
        ideaId,
        yearId,
        adminId,
        'Floating idea',
        'Idea without a demo',
      ),
      env.DB.prepare(
        'INSERT INTO project_members (project_id, user_id) VALUES (?, ?), (?, ?), (?, ?)',
      ).bind(projectId, adminId, projectTwoId, adminId, noVideoId, adminId),
      env.DB.prepare(
        `INSERT INTO video_submissions (
          id, project_id, original_name, size_bytes, original_r2_key,
          processed_r2_key, status, duration_seconds
        ) VALUES
          (?, ?, 'first.mp4', 100, ?, ?, 'ready', 42.5),
          (?, ?, 'second.mp4', 100, ?, ?, 'ready', 18),
          (?, ?, 'failed.mp4', 100, ?, NULL, 'failed', NULL)`,
      ).bind(
        `ready-video-1-${sequence}`,
        projectId,
        `ready-original-1-${sequence}`,
        `ready-processed-1-${sequence}`,
        `ready-video-2-${sequence}`,
        projectTwoId,
        `ready-original-2-${sequence}`,
        `ready-processed-2-${sequence}`,
        `failed-video-${sequence}`,
        failedVideoProjectId,
        `failed-original-${sequence}`,
      ),
    ]);

    const votes = await Promise.all([
      api('/votes', memberToken, {
        method: 'POST',
        body: {yearId, projectId, categoryId: category.id},
      }),
      api('/votes', secondVoterToken, {
        method: 'POST',
        body: {yearId, projectId, categoryId: secondCategory.id},
      }),
      api('/votes', thirdVoterToken, {
        method: 'POST',
        body: {yearId, projectId: projectTwoId, categoryId: category.id},
      }),
    ]);
    expect(votes.map(({status}) => status)).toEqual([201, 201, 201]);

    const award = await api(`/admin/awards/years/${yearId}`, adminToken, {
      method: 'POST',
      body: {name: 'People’s choice', projectId, categoryId: category.id},
    });
    expect(award.status).toBe(201);

    const yearsExport = await api('/admin/analytics/export', adminToken, {raw: true});
    expect(yearsExport.status).toBe(200);
    expect(yearsExport.headers.get('Content-Type')).toContain('text/csv');
    expect(yearsExport.headers.get('Content-Disposition')).toContain(
      'filename="hackweek-year-metrics.csv"',
    );
    // SAFETY: raw CSV responses return text bodies; JSON error payloads fail the status check above.
    const yearsBody = yearsExport.body as string;
    expect(
      yearsBody.startsWith('year,active_voters,votes,projects,ideas,participants,'),
    ).toBe(true);
    expect(yearsBody).toContain(`${yearId},`);
    expect(yearsBody).toMatch(new RegExp(`${yearId},3,3,4,1,1,2,2,1`));

    const projectsExport = await api(
      `/admin/analytics/export?year=${yearId}`,
      adminToken,
      {
        raw: true,
      },
    );
    expect(projectsExport.status).toBe(200);
    expect(projectsExport.headers.get('Content-Disposition')).toContain(
      `filename="hackweek-${yearId}-projects.csv"`,
    );

    // SAFETY: raw CSV responses return text bodies; JSON error payloads fail the status check above.
    const body = projectsExport.body as string;
    const lines = body.trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      [
        'vote_rank',
        'total_votes',
        'project_name',
        'project_url',
        'kind',
        'group_name',
        'description',
        'team_members',
        'awards',
        'category_votes',
        'has_ready_video',
        'video_id',
        'video_url',
        'original_name',
        'duration_seconds',
      ].join(','),
    );
    expect(lines).toHaveLength(6);
    expect(lines[1]).toContain('First screening');
    expect(lines[1]).toContain('"A punchy demo, with commas"');
    expect(lines[1]).toContain('Delight: People’s choice');
    expect(lines[1]).toMatch(/^1,2,/);
    expect(lines[1]).toContain(',yes,');
    expect(body).toContain('No ready video');
    expect(body).toContain(',no,,,');
    expect(body).toContain('Floating idea');
    expect(body).toContain(`/years/${yearId}/projects/${projectId}`);
    expect(body).toContain(`/years/${yearId}/watch/ready-video-1-${sequence}`);
    expect(body).toContain('Failed video project');
    expect(body).not.toContain('creatorId');
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

async function extraVoterToken(label: string) {
  const subject = `admin-voter-${label}-${sequence}`;
  const token = await createSessionCookie({
    sub: subject,
    email: `${subject}@sentry.io`,
    name: label,
  });
  await SELF.fetch(`${base}/session`, {headers: {Cookie: token}});
  return token;
}

async function api(
  path: string,
  token: string,
  options: {method?: string; body?: unknown; raw?: boolean} = {},
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
  const body =
    response.status === 204
      ? null
      : options.raw && !response.headers.get('Content-Type')?.includes('application/json')
        ? await response.text()
        : await response.json<any>();
  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}
