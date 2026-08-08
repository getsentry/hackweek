import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import type {ProjectWriteRequest} from '../../src/shared/projects';
import {createSessionCookie} from '../auth/fixture';

const base = 'https://hackweek.test/api';
let suffix = 0;
let yearId: string;
let groupId: string;
let memberToken: string;
let outsiderToken: string;

beforeEach(async () => {
  suffix += 1;
  yearId = `project-year-${suffix}`;
  groupId = `group-${suffix}`;
  memberToken = await createSessionCookie({
    sub: `project-member-${suffix}`,
    email: `project-member-${suffix}@sentry.io`,
    name: 'Project Member',
  });
  outsiderToken = await createSessionCookie({
    sub: `project-outsider-${suffix}`,
    email: `project-outsider-${suffix}@sentry.io`,
    name: 'Project Outsider',
  });
  await session(memberToken);
  const user = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(`project-member-${suffix}`)
    .first<{id: string}>();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(yearId),
    env.DB.prepare(
      `INSERT INTO groups (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(groupId, groupId, yearId, 'Orbital', user!.id),
  ]);
});

describe('project and history APIs', () => {
  it('lists historical years and paginated projects without N+1 member requests', async () => {
    const project = await createProject(memberToken, {name: 'History engine'});
    const idea = await createProject(memberToken, {
      name: 'Impossible postcard',
      kind: 'idea',
      groupId: null,
    });

    const years = await api('/years', memberToken);
    const page = await api(`/projects?year=${yearId}&limit=1`, memberToken);
    const next = await api(
      `/projects?year=${yearId}&limit=1&cursor=${page.body.nextCursor}`,
      memberToken,
    );

    expect(years.status).toBe(200);
    expect(years.body.years).toContainEqual(
      expect.objectContaining({
        id: yearId,
        projectCount: 1,
        ideaCount: 1,
        groupCount: 1,
        participantCount: 1,
      }),
    );
    expect(page.status).toBe(200);
    expect(page.body.projects).toHaveLength(1);
    expect(page.body.nextCursor).toBe('1');
    expect([
      page.body.projects[0].id,
      ...next.body.projects.map((item: {id: string}) => item.id),
    ]).toEqual(expect.arrayContaining([project.id, idea.id]));
    expect(page.body.projects[0].members).toBeInstanceOf(Array);
  });

  it('derives archived year flags and rejects project creation there', async () => {
    const archivedYearId = `project-archive-${suffix}`;
    await env.DB.prepare(
      'INSERT INTO years (id, voting_enabled, submissions_closed) VALUES (?, 1, 0)',
    )
      .bind(archivedYearId)
      .run();

    const archived = await api('/projects', memberToken, {
      method: 'POST',
      body: {
        ...projectPayload(),
        yearId: archivedYearId,
        kind: 'idea',
        groupId: null,
      },
    });
    const years = await api('/years', memberToken);

    expect(archived).toMatchObject({
      status: 403,
      body: {error: {code: 'AUTH_FORBIDDEN', message: 'Submissions are closed'}},
    });
    expect(years.body.years).toContainEqual(
      expect.objectContaining({
        id: archivedYearId,
        votingEnabled: false,
        submissionsClosed: true,
        isCurrent: false,
      }),
    );
    expect(years.body.years).toContainEqual(
      expect.objectContaining({
        id: yearId,
        submissionsClosed: false,
        isCurrent: true,
      }),
    );
  });

  it('enforces membership, closed submissions, and same-year group references', async () => {
    const project = await createProject(memberToken);
    await session(outsiderToken);

    const forbidden = await api(`/projects/${project.id}`, outsiderToken, {
      method: 'PUT',
      body: projectPayload(),
    });
    const wrongGroup = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {...projectPayload(), groupId: 'missing-group'},
    });
    await env.DB.prepare('UPDATE years SET submissions_closed = 1 WHERE id = ?')
      .bind(yearId)
      .run();
    const closed = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {...projectPayload(), name: 'Too late'},
    });

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(wrongGroup.status).toBe(400);
    expect(wrongGroup.body.error.message).toMatch(/Group/);
    expect(closed.status).toBe(403);
    expect(closed.body.error.message).toMatch(/closed/);
  });

  it('claims an idea once and makes the claimant a member', async () => {
    const idea = await createProject(memberToken, {
      name: 'Claim me',
      kind: 'idea',
      groupId: null,
    });
    await session(outsiderToken);

    const claimed = await api(`/projects/${idea.id}/claim`, outsiderToken, {
      method: 'POST',
      body: {...projectPayload(), name: 'Claimed invention'},
    });
    const repeated = await api(`/projects/${idea.id}/claim`, memberToken, {
      method: 'POST',
      body: projectPayload(),
    });

    expect(claimed.status).toBe(200);
    expect(claimed.body.project).toMatchObject({
      kind: 'project',
      name: 'Claimed invention',
    });
    expect(claimed.body.project.members).toContainEqual(
      expect.objectContaining({email: `project-outsider-${suffix}@sentry.io`}),
    );
    expect(repeated.status).toBe(409);
  });

  it('allows only the creator or an admin to withdraw an open project', async () => {
    const project = await createProject(memberToken);
    await session(outsiderToken);

    const forbidden = await api(`/projects/${project.id}`, outsiderToken, {
      method: 'DELETE',
    });
    const deleted = await api(`/projects/${project.id}`, memberToken, {method: 'DELETE'});
    const missing = await api(`/projects/${project.id}`, memberToken);

    expect(forbidden.status).toBe(403);
    expect(deleted.status).toBe(204);
    expect(missing.status).toBe(404);
  });

  it('lets admins manage groups and clears deleted project references atomically', async () => {
    const project = await createProject(memberToken);
    const adminToken = await createSessionCookie({
      sub: `project-admin-${suffix}`,
      email: `project-admin-${suffix}@sentry.io`,
    });
    await session(adminToken);
    await env.DB.prepare('UPDATE users SET is_admin = 1 WHERE google_subject = ?')
      .bind(`project-admin-${suffix}`)
      .run();

    const created = await api(`/years/${yearId}/groups`, adminToken, {
      method: 'POST',
      body: {name: 'Moonshot'},
    });
    const deleted = await api(`/groups/${groupId}`, adminToken, {method: 'DELETE'});
    const stored = await env.DB.prepare('SELECT group_id FROM projects WHERE id = ?')
      .bind(project.id)
      .first<{group_id: string | null}>();

    expect(created.status).toBe(201);
    expect(created.body.group.name).toBe('Moonshot');
    expect(deleted.status).toBe(204);
    expect(stored?.group_id).toBeNull();
  });
});

async function createProject(
  token: string,
  overrides: Partial<ProjectWriteRequest> = {},
) {
  const response = await api('/projects', token, {
    method: 'POST',
    body: {...projectPayload(), ...overrides},
  });
  expect(response.status).toBe(201);
  return response.body.project as {id: string};
}

function projectPayload(): ProjectWriteRequest {
  return {
    yearId,
    name: 'New signal',
    summary: 'A clear and sufficiently detailed project summary.',
    repository: 'https://github.com/getsentry/example',
    kind: 'project' as const,
    groupId,
    memberIds: [],
    needsHelp: false,
    helpDetails: null,
  };
}

function session(token: string) {
  return SELF.fetch(`${base}/session`, {
    headers: {Cookie: token},
  });
}

async function api(
  path: string,
  token: string,
  options: {method?: string; body?: unknown} = {},
) {
  const response = await SELF.fetch(`${base}${path}`, {
    method: options.method,
    headers: {
      Cookie: token,
      ...(options.method && options.method !== 'GET'
        ? {Origin: 'https://hackweek.test'}
        : {}),
      ...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = response.status === 204 ? null : await response.json<any>();
  return {status: response.status, body};
}
