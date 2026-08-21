import type {AwardSummary} from '../../shared/administration';
import type {ProjectMember, UserProfileResponse} from '../../shared/projects';
import {ServiceError} from '../services/errors';
import {listProjects} from './projects';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: number;
}

interface AwardRow {
  id: string;
  year_id: string;
  project_id: string;
  project_name: string;
  category_id: string;
  category_name: string;
  name: string;
}

export async function getUserProfile(
  db: D1Database,
  userId: string,
): Promise<UserProfileResponse> {
  const userRow = await db
    .prepare(
      `SELECT id, email, display_name, avatar_url, is_admin
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<UserRow>();
  if (!userRow) throw new ServiceError('NOT_FOUND', 'User not found', 404);

  const [yearResult, awardResult] = await Promise.all([
    db
      .prepare(
        `SELECT DISTINCT p.year_id
         FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id
         WHERE p.status = 'active' AND (p.creator_id = ? OR pm.user_id = ?)
         ORDER BY p.year_id DESC`,
      )
      .bind(userId, userId)
      .all<{year_id: string}>(),
    db
      .prepare(
        `SELECT DISTINCT a.id, a.year_id, a.project_id, p.name project_name,
          a.category_id, category.name category_name, a.name
         FROM awards a
         JOIN projects p ON p.id = a.project_id
         JOIN award_categories category ON category.id = a.category_id
         LEFT JOIN project_members pm ON pm.project_id = p.id
         WHERE p.status = 'active' AND (p.creator_id = ? OR pm.user_id = ?)
         ORDER BY a.year_id DESC, category.name COLLATE NOCASE, a.id`,
      )
      .bind(userId, userId)
      .all<AwardRow>(),
  ]);

  const years = await Promise.all(
    yearResult.results.map(async ({year_id}) => ({
      yearId: year_id,
      projects: await projectsForUserAndYear(db, userId, year_id),
    })),
  );
  const projects = years.flatMap((year) => year.projects);

  return {
    user: mapUser(userRow),
    highlights: {
      hackweekCount: years.length,
      projectCount: projects.filter((project) => project.kind === 'project').length,
      ideaCount: projects.filter((project) => project.kind === 'idea').length,
      awardCount: awardResult.results.length,
    },
    awards: awardResult.results.map(mapAward),
    years,
  };
}

async function projectsForUserAndYear(db: D1Database, userId: string, yearId: string) {
  const projects = [];
  let offset = 0;
  while (true) {
    const page = await listProjects(db, {
      yearId,
      userId,
      limit: 250,
      offset,
    });
    projects.push(...page.projects);
    if (!page.nextCursor) return projects;
    offset = Number(page.nextCursor);
  }
}

function mapUser(row: UserRow): ProjectMember {
  const role = row.is_admin ? 'admin' : 'member';
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role,
    actualRole: role,
  };
}

function mapAward(row: AwardRow): AwardSummary {
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
