import type {
  AdminYearResponse,
  AnalyticsProjectExportRow,
  AnalyticsResponse,
  AnalyticsYearExportRow,
  AwardCategorySummary,
  AwardSummary,
  AwardWriteRequest,
  BallotSelection,
  BallotStatusResponse,
  ScreeningOrderItem,
  VoteSummary,
} from '../../shared/administration';
import {
  buildAnalyticsProjectExportRows,
  buildAnalyticsYearExportRows,
  type AnalyticsProjectExportSource,
  type AnalyticsYearExportSource,
} from '../../shared/analytics-export';
import {ServiceError} from '../services/errors';
import {getYear} from './projects';
import {getEffectiveYearFlags} from './years';

interface CategoryRow {
  id: string;
  year_id: string;
  name: string;
}
export async function getVoting(
  db: D1Database,
  yearId: string,
  userId: string,
): Promise<BallotStatusResponse> {
  const year = await getYear(db, yearId);
  const [categoryResult, voteResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, year_id, name FROM award_categories
         WHERE year_id = ? ORDER BY name COLLATE NOCASE, id`,
      )
      .bind(yearId)
      .all<CategoryRow>(),
    db
      .prepare(
        `SELECT v.id, v.year_id, v.project_id, v.award_category_id,
          p.name project_name,
          p.year_id = v.year_id AND p.kind = 'project' AND p.status = 'active'
            project_active,
          NOT EXISTS (
            SELECT 1 FROM project_nominations pn WHERE pn.project_id = p.id
          ) OR EXISTS (
            SELECT 1 FROM project_nominations pn
            WHERE pn.project_id = p.id
              AND pn.award_category_id = v.award_category_id
          ) nomination_eligible
         FROM votes v
         JOIN projects p ON p.id = v.project_id
         WHERE v.year_id = ? AND v.creator_id = ?
         ORDER BY v.award_category_id`,
      )
      .bind(yearId, userId)
      .all<{
        id: string;
        year_id: string;
        project_id: string;
        award_category_id: string;
        project_name: string;
        project_active: number;
        nomination_eligible: number;
      }>(),
  ]);
  return {
    year: {id: year.id, votingEnabled: year.votingEnabled},
    categories: categoryResult.results.map(mapCategory),
    votes: voteResult.results.map(mapBallotSelection),
  };
}

export async function castVote(
  db: D1Database,
  input: {yearId: string; projectId: string; categoryId: string},
  userId: string,
): Promise<VoteSummary> {
  await assertVotingEnabled(db, input.yearId);
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO votes
        (id, source_id, year_id, creator_id, project_id, award_category_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, id, input.yearId, userId, input.projectId, input.categoryId)
      .run();
  } catch (error) {
    throw administrationConstraint(error, 'Vote could not be recorded');
  }
  return {
    id,
    yearId: input.yearId,
    projectId: input.projectId,
    categoryId: input.categoryId,
  };
}

export async function replaceVote(
  db: D1Database,
  voteId: string,
  input: {yearId: string; projectId: string; categoryId: string},
  userId: string,
): Promise<VoteSummary> {
  const existingYearId = await getOwnedVoteYear(db, voteId, userId);
  await assertVotingEnabled(db, existingYearId);
  if (input.yearId !== existingYearId) await assertVotingEnabled(db, input.yearId);
  try {
    const result = await db
      .prepare(
        `UPDATE votes SET year_id = ?, project_id = ?, award_category_id = ?
       WHERE id = ? AND creator_id = ?`,
      )
      .bind(input.yearId, input.projectId, input.categoryId, voteId, userId)
      .run();
    if (!result.meta.changes) throw new ServiceError('NOT_FOUND', 'Vote not found', 404);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw administrationConstraint(error, 'Vote could not be moved');
  }
  return {
    id: voteId,
    yearId: input.yearId,
    projectId: input.projectId,
    categoryId: input.categoryId,
  };
}

export async function deleteVote(db: D1Database, voteId: string, userId: string) {
  const yearId = await getOwnedVoteYear(db, voteId, userId);
  await assertVotingEnabled(db, yearId);
  const result = await db
    .prepare('DELETE FROM votes WHERE id = ? AND creator_id = ?')
    .bind(voteId, userId)
    .run();
  if (!result.meta.changes) throw new ServiceError('NOT_FOUND', 'Vote not found', 404);
}

export async function createYear(db: D1Database, id: string) {
  if (!/^\d{4}$/.test(id)) {
    throw new ServiceError('VALIDATION_FAILED', 'Year must contain four digits', 400);
  }
  try {
    await db.prepare('INSERT INTO years (id) VALUES (?)').bind(id).run();
  } catch (error) {
    throw administrationConstraint(error, 'Year could not be created');
  }
  return getYear(db, id);
}

export async function updateYear(
  db: D1Database,
  id: string,
  input: {votingEnabled: boolean; submissionsClosed: boolean},
) {
  const result = await db
    .prepare(
      `UPDATE years SET voting_enabled = ?, submissions_closed = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
    .bind(Number(input.votingEnabled), Number(input.submissionsClosed), id)
    .run();
  if (!result.meta.changes) throw new ServiceError('NOT_FOUND', 'Year not found', 404);
  return getYear(db, id);
}

export async function getAdminYear(
  db: D1Database,
  yearId: string,
): Promise<AdminYearResponse> {
  const year = await getYear(db, yearId);
  const [categoryResult, awardResult, projectResult, orderResult] = await Promise.all([
    db
      .prepare(
        'SELECT id, year_id, name FROM award_categories WHERE year_id = ? ORDER BY name COLLATE NOCASE, id',
      )
      .bind(yearId)
      .all<CategoryRow>(),
    db
      .prepare(
        `SELECT a.id, a.year_id, a.project_id, p.name project_name,
        a.category_id, c.name category_name, a.name
       FROM awards a JOIN projects p ON p.id = a.project_id
       JOIN award_categories c ON c.id = a.category_id
       WHERE a.year_id = ? ORDER BY c.name COLLATE NOCASE, a.id`,
      )
      .bind(yearId)
      .all<{
        id: string;
        year_id: string;
        project_id: string;
        project_name: string;
        category_id: string;
        category_name: string;
        name: string;
      }>(),
    db
      .prepare(
        `SELECT p.id, p.name, pv.status video_status FROM projects p
       LEFT JOIN video_submissions pv ON pv.project_id = p.id AND pv.retired_at IS NULL
       WHERE p.year_id = ? AND p.kind = 'project' AND p.status = 'active'
       ORDER BY p.name COLLATE NOCASE, p.id`,
      )
      .bind(yearId)
      .all<{
        id: string;
        name: string;
        video_status: import('../../shared/videos').VideoStatus | null;
      }>(),
    db
      .prepare(
        `SELECT o.project_id, p.name project_name, o.position
       FROM screening_order o JOIN projects p ON p.id = o.project_id
       WHERE o.year_id = ? ORDER BY o.position`,
      )
      .bind(yearId)
      .all<{project_id: string; project_name: string; position: number}>(),
  ]);
  return {
    year: {
      id: year.id,
      votingEnabled: year.votingEnabled,
      submissionsClosed: year.submissionsClosed,
      isCurrent: year.isCurrent,
    },
    categories: categoryResult.results.map(mapCategory),
    awards: awardResult.results.map(mapAward),
    projects: projectResult.results.map((project) => ({
      id: project.id,
      name: project.name,
      videoStatus: project.video_status,
    })),
    screeningOrder: orderResult.results.map(
      (row): ScreeningOrderItem => ({
        projectId: row.project_id,
        projectName: row.project_name,
        position: row.position,
      }),
    ),
  };
}

export async function createCategory(
  db: D1Database,
  yearId: string,
  name: string,
  userId: string,
) {
  await getYear(db, yearId);
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO award_categories (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, id, yearId, name, userId)
      .run();
  } catch (error) {
    throw administrationConstraint(error, 'Category could not be created');
  }
  return {id, yearId, name};
}

export async function updateCategory(db: D1Database, id: string, name: string) {
  const result = await db
    .prepare(
      'UPDATE award_categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    )
    .bind(name, id)
    .run();
  if (!result.meta.changes)
    throw new ServiceError('NOT_FOUND', 'Category not found', 404);
  const row = await db
    .prepare('SELECT id, year_id, name FROM award_categories WHERE id = ?')
    .bind(id)
    .first<CategoryRow>();
  return mapCategory(row!);
}

export async function deleteCategory(db: D1Database, id: string) {
  try {
    const result = await db
      .prepare('DELETE FROM award_categories WHERE id = ?')
      .bind(id)
      .run();
    if (!result.meta.changes)
      throw new ServiceError('NOT_FOUND', 'Category not found', 404);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (
      error instanceof Error &&
      error.message.includes('award nominations cannot change while voting is enabled')
    ) {
      throw new ServiceError(
        'CONFLICT',
        'Category cannot be deleted while voting is open because a project nominated it',
        409,
      );
    }
    throw administrationConstraint(error, 'Category is in use and cannot be deleted');
  }
}

export async function createAward(
  db: D1Database,
  yearId: string,
  input: AwardWriteRequest,
  userId: string,
) {
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO awards
        (id, source_id, year_id, project_id, category_id, name, creator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, id, yearId, input.projectId, input.categoryId, input.name, userId)
      .run();
  } catch (error) {
    throw administrationConstraint(error, 'Award could not be created');
  }
  return getAward(db, id);
}

export async function updateAward(db: D1Database, id: string, input: AwardWriteRequest) {
  try {
    const result = await db
      .prepare(
        `UPDATE awards SET project_id = ?, category_id = ?, name = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(input.projectId, input.categoryId, input.name, id)
      .run();
    if (!result.meta.changes) throw new ServiceError('NOT_FOUND', 'Award not found', 404);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw administrationConstraint(error, 'Award could not be saved');
  }
  return getAward(db, id);
}

export async function deleteAward(db: D1Database, id: string) {
  const result = await db.prepare('DELETE FROM awards WHERE id = ?').bind(id).run();
  if (!result.meta.changes) throw new ServiceError('NOT_FOUND', 'Award not found', 404);
}

export async function replaceScreeningOrder(
  db: D1Database,
  yearId: string,
  projectIds: string[],
) {
  try {
    await db.batch([
      db.prepare('DELETE FROM screening_order WHERE year_id = ?').bind(yearId),
      ...projectIds.map((projectId, position) =>
        db
          .prepare(
            `INSERT INTO screening_order (year_id, project_id, position) VALUES (?, ?, ?)`,
          )
          .bind(yearId, projectId, position),
      ),
    ]);
  } catch (error) {
    throw administrationConstraint(error, 'Screening order could not be saved');
  }
  const {results} = await db
    .prepare(
      `SELECT o.project_id, p.name project_name, o.position FROM screening_order o
     JOIN projects p ON p.id = o.project_id WHERE o.year_id = ? ORDER BY o.position`,
    )
    .bind(yearId)
    .all<{project_id: string; project_name: string; position: number}>();
  return results.map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    position: row.position,
  }));
}

export async function getAnalytics(
  db: D1Database,
  selectedYear?: string,
): Promise<AnalyticsResponse> {
  if (selectedYear) await getYear(db, selectedYear);
  const [yearsResult, votesResult, membersResult] = await Promise.all([
    db
      .prepare(
        `SELECT y.id year_id,
        COUNT(DISTINCT v.creator_id) active_voters,
        COUNT(DISTINCT v.id) vote_count,
        COUNT(DISTINCT CASE WHEN p.kind = 'project' AND p.status = 'active' THEN p.id END) project_count,
        COUNT(DISTINCT CASE WHEN p.kind = 'idea' AND p.status = 'active' THEN p.id END) idea_count,
        COUNT(DISTINCT c.id) category_count,
        COUNT(DISTINCT a.id) award_count
       FROM years y LEFT JOIN votes v ON v.year_id = y.id
       LEFT JOIN projects p ON p.year_id = y.id
       LEFT JOIN award_categories c ON c.year_id = y.id
       LEFT JOIN awards a ON a.year_id = y.id
       GROUP BY y.id ORDER BY y.id`,
      )
      .all<{
        year_id: string;
        active_voters: number;
        vote_count: number;
        project_count: number;
        idea_count: number;
        category_count: number;
        award_count: number;
      }>(),
    selectedYear
      ? db
          .prepare(
            `SELECT c.id category_id, c.name category_name, p.id project_id,
            p.name project_name, g.name group_name, COUNT(v.id) vote_count
           FROM award_categories c
           JOIN votes v ON v.award_category_id = c.id AND v.year_id = c.year_id
           JOIN projects p ON p.id = v.project_id
           LEFT JOIN groups g ON g.id = p.group_id
           WHERE c.year_id = ? GROUP BY c.id, p.id
           ORDER BY c.name COLLATE NOCASE, vote_count DESC, p.name COLLATE NOCASE`,
          )
          .bind(selectedYear)
          .all<{
            category_id: string;
            category_name: string;
            project_id: string;
            project_name: string;
            group_name: string | null;
            vote_count: number;
          }>()
      : Promise.resolve({results: []}),
    selectedYear
      ? db
          .prepare(
            `SELECT pm.project_id, u.id, u.display_name, u.avatar_url
             FROM project_members pm JOIN users u ON u.id = pm.user_id
             WHERE EXISTS (
               SELECT 1 FROM votes v
               WHERE v.project_id = pm.project_id AND v.year_id = ?
             )
             ORDER BY pm.project_id, u.display_name COLLATE NOCASE, u.id`,
          )
          .bind(selectedYear)
          .all<{
            project_id: string;
            id: string;
            display_name: string;
            avatar_url: string | null;
          }>()
      : Promise.resolve({results: []}),
  ]);
  const membersByProject = new Map<
    string,
    {id: string; displayName: string; avatarUrl: string | null}[]
  >();
  for (const row of membersResult.results) {
    const members = membersByProject.get(row.project_id) ?? [];
    members.push({
      id: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    });
    membersByProject.set(row.project_id, members);
  }

  return {
    years: yearsResult.results.map((row) => ({
      yearId: row.year_id,
      activeVoters: row.active_voters,
      voteCount: row.vote_count,
      projectCount: row.project_count,
      ideaCount: row.idea_count,
      categoryCount: row.category_count,
      awardCount: row.award_count,
    })),
    voteResults: votesResult.results.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      projectId: row.project_id,
      projectName: row.project_name,
      groupName: row.group_name,
      members: membersByProject.get(row.project_id) ?? [],
      voteCount: row.vote_count,
    })),
  };
}

/** Multi-year participation metrics for retrospective comparisons. */
export async function getAnalyticsYearExport(
  db: D1Database,
): Promise<AnalyticsYearExportRow[]> {
  const {results} = await db
    .prepare(
      `SELECT y.id year_id,
        (SELECT COUNT(DISTINCT v.creator_id) FROM votes v WHERE v.year_id = y.id)
          active_voters,
        (SELECT COUNT(*) FROM votes v WHERE v.year_id = y.id) vote_count,
        (SELECT COUNT(*) FROM projects p
          WHERE p.year_id = y.id AND p.kind = 'project' AND p.status = 'active')
          project_count,
        (SELECT COUNT(*) FROM projects p
          WHERE p.year_id = y.id AND p.kind = 'idea' AND p.status = 'active')
          idea_count,
        (SELECT COUNT(DISTINCT pm.user_id)
          FROM project_members pm
          JOIN projects p ON p.id = pm.project_id
          WHERE p.year_id = y.id AND p.status = 'active') participant_count,
        (SELECT COUNT(*)
          FROM video_submissions pv
          JOIN projects p ON p.id = pv.project_id
          WHERE p.year_id = y.id AND p.kind = 'project' AND p.status = 'active'
            AND pv.status = 'ready' AND pv.retired_at IS NULL) ready_video_count,
        (SELECT COUNT(*) FROM award_categories c WHERE c.year_id = y.id)
          category_count,
        (SELECT COUNT(*) FROM awards a WHERE a.year_id = y.id) award_count
       FROM years y
       ORDER BY y.id`,
    )
    .all<{
      year_id: string;
      active_voters: number;
      vote_count: number;
      project_count: number;
      idea_count: number;
      participant_count: number;
      ready_video_count: number;
      category_count: number;
      award_count: number;
    }>();

  const sources: AnalyticsYearExportSource[] = results.map((row) => ({
    yearId: row.year_id,
    activeVoters: row.active_voters,
    voteCount: row.vote_count,
    projectCount: row.project_count,
    ideaCount: row.idea_count,
    participantCount: row.participant_count,
    readyVideoCount: row.ready_video_count,
    categoryCount: row.category_count,
    awardCount: row.award_count,
  }));

  return buildAnalyticsYearExportRows(sources);
}

/**
 * Year-scoped project analytics for retros, ceremony prep, and optional media harvest.
 * Includes active projects/ideas even when no ready video exists.
 */
export async function getAnalyticsProjectExport(
  db: D1Database,
  yearId: string,
): Promise<AnalyticsProjectExportRow[]> {
  await getYear(db, yearId);

  const [projectsResult, votesResult, membersResult, awardsResult] = await Promise.all([
    db
      .prepare(
        `SELECT p.id project_id, p.name project_name, p.kind, p.summary,
          g.name group_name,
          pv.id video_id, pv.original_name, pv.duration_seconds
         FROM projects p
         LEFT JOIN groups g ON g.id = p.group_id
         LEFT JOIN video_submissions pv
           ON pv.project_id = p.id
          AND pv.status = 'ready'
          AND pv.retired_at IS NULL
         WHERE p.year_id = ? AND p.status = 'active'
         ORDER BY p.name COLLATE NOCASE, p.id`,
      )
      .bind(yearId)
      .all<{
        project_id: string;
        project_name: string;
        kind: 'project' | 'idea';
        summary: string | null;
        group_name: string | null;
        video_id: string | null;
        original_name: string | null;
        duration_seconds: number | null;
      }>(),
    db
      .prepare(
        `SELECT v.project_id, c.name category_name, COUNT(v.id) vote_count
         FROM votes v
         JOIN award_categories c ON c.id = v.award_category_id
         WHERE v.year_id = ?
         GROUP BY v.project_id, c.id
         ORDER BY v.project_id, vote_count DESC, c.name COLLATE NOCASE`,
      )
      .bind(yearId)
      .all<{project_id: string; category_name: string; vote_count: number}>(),
    db
      .prepare(
        `SELECT pm.project_id, u.display_name
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
         JOIN projects p ON p.id = pm.project_id
         WHERE p.year_id = ? AND p.status = 'active'
         ORDER BY pm.project_id, u.display_name COLLATE NOCASE, u.id`,
      )
      .bind(yearId)
      .all<{project_id: string; display_name: string}>(),
    db
      .prepare(
        `SELECT a.project_id, c.name category_name, a.name award_name
         FROM awards a
         JOIN award_categories c ON c.id = a.category_id
         WHERE a.year_id = ?
         ORDER BY a.project_id, c.name COLLATE NOCASE, a.name COLLATE NOCASE`,
      )
      .bind(yearId)
      .all<{project_id: string; category_name: string; award_name: string}>(),
  ]);

  const membersByProject = new Map<string, string[]>();
  for (const row of membersResult.results) {
    const members = membersByProject.get(row.project_id) ?? [];
    members.push(row.display_name);
    membersByProject.set(row.project_id, members);
  }

  const votesByProject = new Map<
    string,
    Array<{categoryName: string; voteCount: number}>
  >();
  for (const row of votesResult.results) {
    const votes = votesByProject.get(row.project_id) ?? [];
    votes.push({categoryName: row.category_name, voteCount: row.vote_count});
    votesByProject.set(row.project_id, votes);
  }

  const awardsByProject = new Map<string, string[]>();
  for (const row of awardsResult.results) {
    const awards = awardsByProject.get(row.project_id) ?? [];
    const label =
      row.award_name.trim().toLowerCase() === row.category_name.trim().toLowerCase()
        ? row.category_name
        : `${row.category_name}: ${row.award_name}`;
    awards.push(label);
    awardsByProject.set(row.project_id, awards);
  }

  const sources: AnalyticsProjectExportSource[] = projectsResult.results.map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    kind: row.kind,
    groupName: row.group_name,
    summary: row.summary,
    teamMembers: membersByProject.get(row.project_id) ?? [],
    awards: awardsByProject.get(row.project_id) ?? [],
    categoryVotes: votesByProject.get(row.project_id) ?? [],
    videoId: row.video_id,
    originalName: row.original_name,
    durationSeconds: row.duration_seconds,
  }));

  return buildAnalyticsProjectExportRows(yearId, sources);
}

async function assertVotingEnabled(db: D1Database, yearId: string) {
  const year = await getEffectiveYearFlags(db, yearId);
  if (!year?.votingEnabled) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'voting is not enabled for this year',
      400,
    );
  }
}

async function getOwnedVoteYear(db: D1Database, voteId: string, userId: string) {
  const vote = await db
    .prepare('SELECT year_id FROM votes WHERE id = ? AND creator_id = ?')
    .bind(voteId, userId)
    .first<{year_id: string}>();
  if (!vote) throw new ServiceError('NOT_FOUND', 'Vote not found', 404);
  return vote.year_id;
}

async function getAward(db: D1Database, id: string): Promise<AwardSummary> {
  const row = await db
    .prepare(
      `SELECT a.id, a.year_id, a.project_id, p.name project_name,
      a.category_id, c.name category_name, a.name
     FROM awards a JOIN projects p ON p.id = a.project_id
     JOIN award_categories c ON c.id = a.category_id WHERE a.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      year_id: string;
      project_id: string;
      project_name: string;
      category_id: string;
      category_name: string;
      name: string;
    }>();
  if (!row) throw new ServiceError('NOT_FOUND', 'Award not found', 404);
  return mapAward(row);
}

function mapCategory(row: CategoryRow): AwardCategorySummary {
  return {id: row.id, yearId: row.year_id, name: row.name};
}

function mapBallotSelection(row: {
  id: string;
  year_id: string;
  project_id: string;
  award_category_id: string;
  project_name: string;
  project_active: number;
  nomination_eligible: number;
}): BallotSelection {
  return {
    id: row.id,
    yearId: row.year_id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectActive: Boolean(row.project_active),
    nominationEligible: Boolean(row.nomination_eligible),
    categoryId: row.award_category_id,
  };
}

function mapAward(row: {
  id: string;
  year_id: string;
  project_id: string;
  project_name: string;
  category_id: string;
  category_name: string;
  name: string;
}): AwardSummary {
  return {
    id: row.id,
    yearId: row.year_id,
    projectId: row.project_id,
    projectName: row.project_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
  };
}

function administrationConstraint(cause: unknown, fallback: string) {
  if (!(cause instanceof Error)) return cause;
  if (cause.message.includes('UNIQUE constraint failed')) {
    return new ServiceError('CONFLICT', 'That record already exists', 409);
  }
  const known = [
    'voting is not enabled',
    'vote project must',
    'vote category must',
    'vote project is not eligible for this award category',
    'users cannot vote',
    'award references must',
    'screening entry must',
    'FOREIGN KEY constraint failed',
  ].find((message) => cause.message.includes(message));
  if (known) return new ServiceError('VALIDATION_FAILED', known, 400);
  return new ServiceError('CONFLICT', fallback, 409);
}
