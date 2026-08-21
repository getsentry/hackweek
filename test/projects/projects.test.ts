import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import type {ProjectWriteRequest} from '../../src/shared/projects';
import {createSessionCookie} from '../auth/fixture';

const base = 'https://hackweek.test/api';
let suffix = 0;
let yearId: string;
let priorYearId: string;
let groupId: string;
let categoryId: string;
let secondCategoryId: string;
let priorYearCategoryId: string;
let memberToken: string;
let outsiderToken: string;

beforeEach(async () => {
  suffix += 1;
  yearId = `project-year-${String(suffix).padStart(3, '0')}`;
  priorYearId = `project-prior-year-${String(suffix).padStart(3, '0')}`;
  groupId = `group-${suffix}`;
  categoryId = `category-${suffix}-delight`;
  secondCategoryId = `category-${suffix}-craft`;
  priorYearCategoryId = `category-${suffix}-prior`;
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
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(priorYearId),
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(yearId),
    env.DB.prepare(
      `INSERT INTO groups (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(groupId, groupId, yearId, 'Orbital', user!.id),
    env.DB.prepare(
      `INSERT INTO award_categories (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(categoryId, categoryId, yearId, 'Delight', user!.id),
    env.DB.prepare(
      `INSERT INTO award_categories (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(secondCategoryId, secondCategoryId, yearId, 'Craft', user!.id),
    env.DB.prepare(
      `INSERT INTO award_categories (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(priorYearCategoryId, priorYearCategoryId, priorYearId, 'Past award', user!.id),
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

  it('includes owned and attached projects on the year payload', async () => {
    const owned = await createProject(memberToken, {name: 'Owned engine'});
    const idea = await createProject(memberToken, {
      name: 'Owned postcard',
      kind: 'idea',
      groupId: null,
    });
    await session(outsiderToken);
    const outsiderProject = await createProject(outsiderToken, {name: 'Outsider engine'});
    const attached = await createProject(outsiderToken, {name: 'Attached engine'});
    const member = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
      .bind(`project-member-${suffix}`)
      .first<{id: string}>();
    await env.DB.prepare(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
    )
      .bind(attached.id, member!.id)
      .run();

    const year = await api(`/years/${yearId}`, memberToken);
    const outsiderYear = await api(`/years/${yearId}`, outsiderToken);

    expect(year.status).toBe(200);
    expect(year.body.myProjects.map((project: {id: string}) => project.id)).toEqual([
      attached.id,
      owned.id,
      idea.id,
    ]);
    expect(
      outsiderYear.body.myProjects.map((project: {id: string}) => project.id),
    ).toEqual([attached.id, outsiderProject.id]);
  });

  it('returns ordered year categories and persists ordered project nominations', async () => {
    const options = await api(`/years/${yearId}/options`, memberToken);
    const allCategories = await createProject(memberToken, {
      name: 'All categories',
    });
    const focused = await createProject(memberToken, {
      name: 'Focused project',
      nominationCategoryIds: [categoryId],
    });
    const updated = await api(`/projects/${focused.id}`, memberToken, {
      method: 'PUT',
      body: {
        ...projectPayload(),
        name: 'Focused project',
        nominationCategoryIds: [categoryId, secondCategoryId],
      },
    });
    const detail = await api(`/projects/${allCategories.id}`, memberToken);
    const page = await api(`/projects?year=${yearId}`, memberToken);
    const stored = await env.DB.prepare(
      `SELECT award_category_id, position FROM project_nominations
       WHERE project_id = ? ORDER BY position`,
    )
      .bind(focused.id)
      .all<{award_category_id: string; position: number}>();
    const allCategoryNominationCount = await env.DB.prepare(
      'SELECT COUNT(*) count FROM project_nominations WHERE project_id = ?',
    )
      .bind(allCategories.id)
      .first<{count: number}>();

    expect(options).toMatchObject({
      status: 200,
      body: {
        categories: [
          {id: secondCategoryId, yearId, name: 'Craft'},
          {id: categoryId, yearId, name: 'Delight'},
        ],
      },
    });
    expect(detail.body.project.nominationCategoryIds).toEqual([]);
    expect(allCategoryNominationCount?.count).toBe(0);
    expect(updated.body.project.nominationCategoryIds).toEqual([
      categoryId,
      secondCategoryId,
    ]);
    expect(stored.results).toEqual([
      {award_category_id: categoryId, position: 1},
      {award_category_id: secondCategoryId, position: 2},
    ]);
    expect(
      page.body.projects.find((project: {id: string}) => project.id === focused.id),
    ).not.toHaveProperty('nominationCategoryIds');
  });

  it('rejects invalid nomination sets without changing stored project data', async () => {
    const project = await createProject(memberToken, {
      name: 'Stable project',
      nominationCategoryIds: [categoryId],
    });
    const duplicate = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {
        ...projectPayload(),
        nominationCategoryIds: [categoryId, categoryId],
      },
    });
    const oversized = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {
        ...projectPayload(),
        nominationCategoryIds: [categoryId, secondCategoryId, 'third'],
      },
    });
    const missing = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {...projectPayload(), nominationCategoryIds: ['missing-category']},
    });
    const crossYear = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {
        ...projectPayload(),
        name: 'Must not be stored',
        nominationCategoryIds: [priorYearCategoryId],
      },
    });
    const malformed = await api('/projects', memberToken, {
      method: 'POST',
      body: {...projectPayload(), nominationCategoryIds: undefined},
    });
    const storedProject = await env.DB.prepare('SELECT name FROM projects WHERE id = ?')
      .bind(project.id)
      .first<{name: string}>();
    const nominations = await env.DB.prepare(
      'SELECT award_category_id FROM project_nominations WHERE project_id = ?',
    )
      .bind(project.id)
      .all<{award_category_id: string}>();

    for (const response of [duplicate, oversized, missing, crossYear, malformed]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(storedProject?.name).toBe('Stable project');
    expect(nominations.results).toEqual([{award_category_id: categoryId}]);
  });

  it('keeps ideas nomination-free and lets claims establish nominations', async () => {
    const idea = await createProject(memberToken, {
      name: 'Claim me',
      kind: 'idea',
      groupId: null,
    });
    const rejectedIdea = await api('/projects', memberToken, {
      method: 'POST',
      body: {
        ...projectPayload(),
        kind: 'idea',
        groupId: null,
        nominationCategoryIds: [categoryId],
      },
    });
    await session(outsiderToken);
    const claimed = await api(`/projects/${idea.id}/claim`, outsiderToken, {
      method: 'POST',
      body: {
        ...projectPayload(),
        name: 'Claimed with focus',
        nominationCategoryIds: [secondCategoryId, categoryId],
      },
    });

    expect(rejectedIdea).toMatchObject({
      status: 400,
      body: {error: {code: 'VALIDATION_FAILED'}},
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.project.nominationCategoryIds).toEqual([
      secondCategoryId,
      categoryId,
    ]);
  });

  it('freezes nomination changes while voting permits unrelated edits', async () => {
    const project = await createProject(memberToken, {
      name: 'Voting project',
      nominationCategoryIds: [categoryId],
    });
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();

    const unchanged = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {
        ...projectPayload(),
        name: 'Allowed rename',
        nominationCategoryIds: [categoryId],
      },
    });
    const changed = await api(`/projects/${project.id}`, memberToken, {
      method: 'PUT',
      body: {
        ...projectPayload(),
        name: 'Blocked rename',
        nominationCategoryIds: [secondCategoryId],
      },
    });
    const stored = await api(`/projects/${project.id}`, memberToken);

    expect(unchanged).toMatchObject({
      status: 200,
      body: {project: {name: 'Allowed rename', nominationCategoryIds: [categoryId]}},
    });
    expect(changed).toMatchObject({
      status: 409,
      body: {error: {code: 'CONFLICT'}},
    });
    expect(stored.body.project).toMatchObject({
      name: 'Allowed rename',
      nominationCategoryIds: [categoryId],
    });
  });

  it('rejects focused project creation and claims during voting without partial writes', async () => {
    const idea = await createProject(memberToken, {
      name: 'Live claim candidate',
      kind: 'idea',
      groupId: null,
    });
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();

    const focusedCreate = await api('/projects', memberToken, {
      method: 'POST',
      body: {
        ...projectPayload(),
        name: 'Blocked live project',
        nominationCategoryIds: [categoryId],
      },
    });
    const allCategoryCreate = await api('/projects', memberToken, {
      method: 'POST',
      body: {...projectPayload(), name: 'Allowed live project'},
    });
    const focusedClaim = await api(`/projects/${idea.id}/claim`, outsiderToken, {
      method: 'POST',
      body: {...projectPayload(), nominationCategoryIds: [categoryId]},
    });
    const storedAfterFailedClaim = await env.DB.prepare(
      `SELECT p.kind,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) member_count,
        (SELECT COUNT(*) FROM project_nominations pn WHERE pn.project_id = p.id) nomination_count
       FROM projects p WHERE p.id = ?`,
    )
      .bind(idea.id)
      .first<{kind: string; member_count: number; nomination_count: number}>();
    const allCategoryClaim = await api(`/projects/${idea.id}/claim`, outsiderToken, {
      method: 'POST',
      body: projectPayload(),
    });
    const blockedProject = await env.DB.prepare('SELECT id FROM projects WHERE name = ?')
      .bind('Blocked live project')
      .first();

    for (const response of [focusedCreate, focusedClaim]) {
      expect(response).toMatchObject({
        status: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Award nominations cannot change after voting has opened',
          },
        },
      });
    }
    expect(blockedProject).toBeNull();
    expect(allCategoryCreate).toMatchObject({
      status: 201,
      body: {project: {nominationCategoryIds: []}},
    });
    expect(storedAfterFailedClaim).toEqual({
      kind: 'idea',
      member_count: 0,
      nomination_count: 0,
    });
    expect(allCategoryClaim).toMatchObject({
      status: 200,
      body: {project: {kind: 'project', nominationCategoryIds: []}},
    });
  });

  it('exposes project voting permission for eligible viewers but not creators, members, or ideas', async () => {
    const project = await createProject(memberToken);
    const idea = await createProject(memberToken, {kind: 'idea', groupId: null});
    const creatorView = await api(`/projects/${project.id}`, memberToken);

    await session(outsiderToken);
    const outsider = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
      .bind(`project-outsider-${suffix}`)
      .first<{id: string}>();
    const eligibleView = await api(`/projects/${project.id}`, outsiderToken);
    const ideaView = await api(`/projects/${idea.id}`, outsiderToken);

    await env.DB.prepare(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
    )
      .bind(project.id, outsider!.id)
      .run();
    const memberView = await api(`/projects/${project.id}`, outsiderToken);

    expect(creatorView.body.project.permissions.canVote).toBe(false);
    expect(eligibleView.body.project.permissions.canVote).toBe(true);
    expect(memberView.body.project.permissions.canVote).toBe(false);
    expect(ideaView.body.project.permissions.canVote).toBe(false);
  });

  it('lists more than 100 projects without exceeding D1 bound-parameter limits', async () => {
    const user = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
      .bind(`project-member-${suffix}`)
      .first<{id: string}>();
    const statements = Array.from({length: 101}, (_, index) => {
      const id = `bulk-project-${suffix}-${index}`;
      return [
        env.DB.prepare(
          `INSERT INTO projects (id, source_id, year_id, creator_id, name, kind, group_id)
           VALUES (?, ?, ?, ?, ?, 'project', ?)`,
        ).bind(id, id, yearId, user!.id, `Bulk project ${index}`, groupId),
        env.DB.prepare(
          'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
        ).bind(id, user!.id),
      ];
    }).flat();
    await env.DB.batch(statements);

    const page = await api(
      `/projects?year=${yearId}&kind=project&limit=101`,
      memberToken,
    );

    expect(page.status).toBe(200);
    expect(page.body.projects).toHaveLength(101);
    expect(page.body.nextCursor).toBeNull();
    expect(page.body.projects[0].members).toEqual([
      expect.objectContaining({email: `project-member-${suffix}@sentry.io`}),
    ]);
  });

  it('searches titles and descriptions before pagination with relevant results first', async () => {
    const exact = await createProject(memberToken, {
      name: 'Signal',
      summary: 'An exact title match.',
    });
    const prefix = await createProject(memberToken, {
      name: 'Signal relay',
      summary: 'A title prefix match.',
    });
    const description = await createProject(memberToken, {
      name: 'Quiet engine',
      summary: 'Routes an important signal between services.',
    });
    await createProject(memberToken, {
      name: 'Unrelated project',
      summary: 'Nothing to see here.',
    });
    await createProject(memberToken, {
      name: 'Idea signal',
      summary: 'A matching idea excluded by the kind filter.',
      kind: 'idea',
      groupId: null,
    });

    const matches = await api(
      `/projects?year=${yearId}&kind=project&group=${groupId}&q=signal&limit=3`,
      memberToken,
    );
    const secondPage = await api(
      `/projects?year=${yearId}&kind=project&group=${groupId}&q=signal&limit=1&cursor=1`,
      memberToken,
    );

    expect(matches.status).toBe(200);
    expect(matches.body.projects.map((project: {id: string}) => project.id)).toEqual([
      exact.id,
      prefix.id,
      description.id,
    ]);
    expect(secondPage.body.projects[0].id).toBe(prefix.id);
    expect(secondPage.body.nextCursor).toBe('2');
  });

  it('treats SQL wildcards literally and bounds search input', async () => {
    const percent = await createProject(memberToken, {
      name: '100% reliable',
      summary: 'A literal percentage marker.',
    });
    const underscore = await createProject(memberToken, {
      name: 'Project_alpha',
      summary: 'A literal underscore marker.',
    });
    await createProject(memberToken, {
      name: '1000 reliable',
      summary: 'Must not match the percentage query.',
    });
    await createProject(memberToken, {
      name: 'ProjectXalpha',
      summary: 'Must not match the underscore query.',
    });

    const percentMatches = await api(
      `/projects?year=${yearId}&q=${encodeURIComponent('100%')}`,
      memberToken,
    );
    const underscoreMatches = await api(
      `/projects?year=${yearId}&q=${encodeURIComponent('Project_')}`,
      memberToken,
    );
    const tooLong = await api(
      `/projects?year=${yearId}&q=${'x'.repeat(101)}`,
      memberToken,
    );

    expect(
      percentMatches.body.projects.map((project: {id: string}) => project.id),
    ).toEqual([percent.id]);
    expect(
      underscoreMatches.body.projects.map((project: {id: string}) => project.id),
    ).toEqual([underscore.id]);
    expect(tooLong).toMatchObject({
      status: 400,
      body: {error: {code: 'VALIDATION_FAILED'}},
    });
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
  const project: {id: string} = response.body.project;
  return project;
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
    nominationCategoryIds: [],
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
  const body = response.status === 204 ? null : await response.json<any>();
  return {status: response.status, body};
}
