import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import {createSessionCookie} from '../auth/fixture';

const base = 'https://hackweek.test/api';
let sequence = 0;
let yearId: string;
let otherYearId: string;
let voterToken: string;
let memberToken: string;
let voterId: string;
let memberId: string;
let creatorId: string;
let projectId: string;
let ownProjectId: string;
let categoryId: string;
let secondCategoryId: string;
let excludedCategoryId: string;
let otherYearCategoryId: string;

beforeEach(async () => {
  sequence += 1;
  yearId = `vote-year-${sequence}`;
  otherYearId = `vote-other-${sequence}`;
  projectId = `vote-project-${sequence}`;
  ownProjectId = `vote-own-project-${sequence}`;
  categoryId = `vote-category-${sequence}`;
  secondCategoryId = `vote-category-2-${sequence}`;
  excludedCategoryId = `vote-category-3-${sequence}`;
  otherYearCategoryId = `vote-category-other-${sequence}`;
  voterToken = await tokenAndSession('voter');
  memberToken = await tokenAndSession('member');
  creatorId = `vote-creator-${sequence}`;
  await env.DB.prepare(
    `INSERT INTO users (id, source_uid, email, display_name)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(creatorId, creatorId, `${creatorId}@sentry.io`, 'Creator')
    .run();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO years (id, voting_enabled) VALUES (?, 1), (?, 1)').bind(
      yearId,
      otherYearId,
    ),
    env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    ).bind(
      projectId,
      projectId,
      yearId,
      creatorId,
      'Signal',
      ownProjectId,
      ownProjectId,
      yearId,
      creatorId,
      'Own signal',
    ),
    env.DB.prepare(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
    ).bind(ownProjectId, memberId),
    env.DB.prepare(
      `INSERT INTO award_categories (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?)`,
    ).bind(
      categoryId,
      categoryId,
      yearId,
      'Delight',
      creatorId,
      secondCategoryId,
      secondCategoryId,
      yearId,
      'Craft',
      creatorId,
      excludedCategoryId,
      excludedCategoryId,
      yearId,
      'Impact',
      creatorId,
      otherYearCategoryId,
      otherYearCategoryId,
      otherYearId,
      'Elsewhere',
      creatorId,
    ),
  ]);
});

describe('voting invariants', () => {
  it('treats a nomination-free project as eligible in every year category', async () => {
    const created: Awaited<ReturnType<typeof api>>[] = [];
    for (const currentCategoryId of [categoryId, secondCategoryId, excludedCategoryId]) {
      created.push(
        await api('/votes', voterToken, {
          method: 'POST',
          body: {...voteBody(), categoryId: currentCategoryId},
        }),
      );
    }
    expect(created.map(({status}) => status)).toEqual([201, 201, 201]);
    await env.DB.prepare('UPDATE projects SET name = ? WHERE id = ?')
      .bind('Renamed signal', projectId)
      .run();

    const voting = await api(`/votes?year=${yearId}`, voterToken);
    const otherUser = await api(`/votes?year=${yearId}`, memberToken);
    const nominations = await env.DB.prepare(
      'SELECT COUNT(*) count FROM project_nominations WHERE project_id = ?',
    )
      .bind(projectId)
      .first<{count: number}>();

    expect(nominations?.count).toBe(0);
    expect(voting.body).toEqual({
      year: {id: yearId, votingEnabled: true},
      categories: [
        {id: secondCategoryId, yearId, name: 'Craft'},
        {id: categoryId, yearId, name: 'Delight'},
        {id: excludedCategoryId, yearId, name: 'Impact'},
      ],
      votes: expect.arrayContaining(
        [categoryId, secondCategoryId, excludedCategoryId].map(
          (currentCategoryId, index) => ({
            id: created[index].body.vote.id,
            yearId,
            projectId,
            projectName: 'Renamed signal',
            projectActive: true,
            nominationEligible: true,
            categoryId: currentCategoryId,
          }),
        ),
      ),
    });
    expect(voting.body.votes).toHaveLength(3);
    expect(otherUser.body).toEqual({
      year: {id: yearId, votingEnabled: true},
      categories: [
        {id: secondCategoryId, yearId, name: 'Craft'},
        {id: categoryId, yearId, name: 'Delight'},
        {id: excludedCategoryId, yearId, name: 'Impact'},
      ],
      votes: [],
    });
  });

  it('accepts nominated categories and atomically rejects excluded casts and moves', async () => {
    await env.DB.prepare('UPDATE years SET voting_enabled = 0 WHERE id = ?')
      .bind(yearId)
      .run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO project_nominations
          (project_id, award_category_id, position) VALUES (?, ?, 1)`,
      ).bind(projectId, categoryId),
      env.DB.prepare(
        `INSERT INTO project_nominations
          (project_id, award_category_id, position) VALUES (?, ?, 2)`,
      ).bind(projectId, secondCategoryId),
    ]);
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();

    const firstEligible = await api('/votes', voterToken, {
      method: 'POST',
      body: voteBody(),
    });
    const secondEligible = await api('/votes', voterToken, {
      method: 'POST',
      body: {...voteBody(), categoryId: secondCategoryId},
    });
    const excluded = await api('/votes', voterToken, {
      method: 'POST',
      body: {...voteBody(), categoryId: excludedCategoryId},
    });

    const unrestrictedProjectId = `${projectId}-unrestricted`;
    await env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        unrestrictedProjectId,
        unrestrictedProjectId,
        yearId,
        creatorId,
        'Unrestricted signal',
      )
      .run();
    const movable = await api('/votes', voterToken, {
      method: 'POST',
      body: {
        ...voteBody(),
        projectId: unrestrictedProjectId,
        categoryId: excludedCategoryId,
      },
    });
    const rejectedMove = await api(`/votes/${movable.body.vote.id}`, voterToken, {
      method: 'PUT',
      body: {...voteBody(), categoryId: excludedCategoryId},
    });
    const storedMove = await env.DB.prepare('SELECT project_id FROM votes WHERE id = ?')
      .bind(movable.body.vote.id)
      .first<{project_id: string}>();

    expect([firstEligible.status, secondEligible.status]).toEqual([201, 201]);
    for (const response of [excluded, rejectedMove]) {
      expect(response).toMatchObject({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'vote project is not eligible for this award category',
          },
        },
      });
    }
    expect(storedMove?.project_id).toBe(unrestrictedProjectId);
    const restrictedVotes = await env.DB.prepare(
      'SELECT COUNT(*) count FROM votes WHERE project_id = ?',
    )
      .bind(projectId)
      .first<{count: number}>();
    expect(restrictedVotes?.count).toBe(2);
  });

  it('keeps a pre-existing active ineligible selection visible and movable', async () => {
    const created = await api('/votes', voterToken, {method: 'POST', body: voteBody()});
    await env.DB.prepare('UPDATE years SET voting_enabled = 0 WHERE id = ?')
      .bind(yearId)
      .run();
    await env.DB.prepare(
      `INSERT INTO project_nominations
        (project_id, award_category_id, position) VALUES (?, ?, 1)`,
    )
      .bind(projectId, secondCategoryId)
      .run();
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();

    const ineligibleStatus = await api(`/votes?year=${yearId}`, voterToken);
    const storedBeforeMove = await env.DB.prepare(
      'SELECT project_id FROM votes WHERE id = ?',
    )
      .bind(created.body.vote.id)
      .first<{project_id: string}>();
    expect(storedBeforeMove?.project_id).toBe(projectId);
    expect(ineligibleStatus.body.votes).toEqual([
      expect.objectContaining({
        id: created.body.vote.id,
        projectId,
        projectActive: true,
        nominationEligible: false,
        categoryId,
      }),
    ]);

    const replacementProjectId = `${projectId}-replacement`;
    await env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        replacementProjectId,
        replacementProjectId,
        yearId,
        creatorId,
        'Replacement signal',
      )
      .run();
    const moved = await api(`/votes/${created.body.vote.id}`, voterToken, {
      method: 'PUT',
      body: {...voteBody(), projectId: replacementProjectId},
    });
    expect(moved.body.vote.projectId).toBe(replacementProjectId);

    const movedStatus = await api(`/votes?year=${yearId}`, voterToken);
    expect(movedStatus.body.votes).toEqual([
      expect.objectContaining({
        id: created.body.vote.id,
        projectId: replacementProjectId,
        projectActive: true,
        nominationEligible: true,
        categoryId,
      }),
    ]);
  });

  it('keeps a withdrawn project selection visible and movable', async () => {
    const replacementProjectId = `${projectId}-replacement`;
    await env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        replacementProjectId,
        replacementProjectId,
        yearId,
        creatorId,
        'Replacement signal',
      )
      .run();
    const created = await api('/votes', voterToken, {method: 'POST', body: voteBody()});
    await env.DB.prepare("UPDATE projects SET status = 'withdrawn' WHERE id = ?")
      .bind(projectId)
      .run();

    const withdrawnStatus = await api(`/votes?year=${yearId}`, voterToken);
    expect(withdrawnStatus.body.votes).toEqual([
      expect.objectContaining({
        id: created.body.vote.id,
        projectId,
        projectName: 'Signal',
        projectActive: false,
        nominationEligible: true,
        categoryId,
      }),
    ]);

    const moved = await api(`/votes/${created.body.vote.id}`, voterToken, {
      method: 'PUT',
      body: {...voteBody(), projectId: replacementProjectId},
    });
    expect(moved.body.vote.projectId).toBe(replacementProjectId);

    const movedStatus = await api(`/votes?year=${yearId}`, voterToken);
    expect(movedStatus.body.votes).toEqual([
      expect.objectContaining({
        id: created.body.vote.id,
        projectId: replacementProjectId,
        projectName: 'Replacement signal',
        projectActive: true,
        nominationEligible: true,
        categoryId,
      }),
    ]);
  });

  it('rejects disabled, self-project, cross-year, and invalid reference votes', async () => {
    await env.DB.prepare('UPDATE years SET voting_enabled = 0 WHERE id = ?')
      .bind(yearId)
      .run();
    const disabled = await api('/votes', voterToken, {method: 'POST', body: voteBody()});
    await env.DB.prepare('UPDATE years SET voting_enabled = 1 WHERE id = ?')
      .bind(yearId)
      .run();
    const own = await api('/votes', memberToken, {
      method: 'POST',
      body: {...voteBody(), projectId: ownProjectId},
    });
    const crossYear = await api('/votes', voterToken, {
      method: 'POST',
      body: {...voteBody(), categoryId: otherYearCategoryId},
    });
    const missing = await api('/votes', voterToken, {
      method: 'POST',
      body: {...voteBody(), projectId: 'missing'},
    });

    expect(disabled).toMatchObject({
      status: 400,
      body: {error: {code: 'VALIDATION_FAILED'}},
    });
    expect(own.body.error.message).toMatch(/users cannot vote/);
    expect(crossYear.body.error.message).toMatch(/category/);
    expect(missing.status).toBe(400);
  });

  it('rejects vote writes for archived years despite stored voting state', async () => {
    const archivedProjectId = `vote-archived-project-${sequence}`;
    const archivedVoteId = `vote-archived-${sequence}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO projects (id, source_id, year_id, creator_id, name)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        archivedProjectId,
        archivedProjectId,
        otherYearId,
        creatorId,
        'Archived signal',
      ),
      env.DB.prepare(
        `INSERT INTO votes
          (id, source_id, year_id, creator_id, project_id, award_category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        archivedVoteId,
        archivedVoteId,
        otherYearId,
        voterId,
        archivedProjectId,
        otherYearCategoryId,
      ),
    ]);

    const status = await api(`/votes?year=${otherYearId}`, voterToken);
    const cast = await api('/votes', voterToken, {
      method: 'POST',
      body: {
        yearId: otherYearId,
        projectId: archivedProjectId,
        categoryId: otherYearCategoryId,
      },
    });
    const replaced = await api(`/votes/${archivedVoteId}`, voterToken, {
      method: 'PUT',
      body: {
        yearId: otherYearId,
        projectId: archivedProjectId,
        categoryId: otherYearCategoryId,
      },
    });
    const deleted = await api(`/votes/${archivedVoteId}`, voterToken, {
      method: 'DELETE',
    });

    expect(status.body.year).toEqual({id: otherYearId, votingEnabled: false});
    for (const response of [cast, replaced, deleted]) {
      expect(response).toMatchObject({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'voting is not enabled for this year',
          },
        },
      });
    }
  });

  it('atomically enforces one creator/category vote under concurrent attempts', async () => {
    const [first, second] = await Promise.all([
      api('/votes', voterToken, {method: 'POST', body: voteBody()}),
      api('/votes', voterToken, {method: 'POST', body: voteBody()}),
    ]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 409]);
    const count = await env.DB.prepare(
      'SELECT COUNT(*) count FROM votes WHERE year_id = ? AND creator_id = ? AND award_category_id = ?',
    )
      .bind(yearId, voterId, categoryId)
      .first<{count: number}>();
    expect(count?.count).toBe(1);
  });

  it('moves an existing category vote instead of last-write-wins duplication', async () => {
    const secondProject = `${projectId}-second`;
    await env.DB.prepare(
      `INSERT INTO projects (id, source_id, year_id, creator_id, name)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(secondProject, secondProject, yearId, creatorId, 'Other signal')
      .run();
    const created = await api('/votes', voterToken, {method: 'POST', body: voteBody()});
    const moved = await api(`/votes/${created.body.vote.id}`, voterToken, {
      method: 'PUT',
      body: {...voteBody(), projectId: secondProject},
    });

    expect(moved.body.vote.projectId).toBe(secondProject);
    const stored = await env.DB.prepare('SELECT project_id FROM votes WHERE id = ?')
      .bind(created.body.vote.id)
      .first<{project_id: string}>();
    expect(stored?.project_id).toBe(secondProject);
  });
});

function voteBody() {
  return {yearId, projectId, categoryId};
}

async function tokenAndSession(kind: 'voter' | 'member') {
  const subject = `vote-${kind}-${sequence}`;
  const token = await createSessionCookie({
    sub: subject,
    email: `${subject}@sentry.io`,
    name: kind,
  });
  await SELF.fetch(`${base}/session`, {headers: {Cookie: token}});
  const user = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(subject)
    .first<{id: string}>();
  if (kind === 'voter') voterId = user!.id;
  else memberId = user!.id;
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
