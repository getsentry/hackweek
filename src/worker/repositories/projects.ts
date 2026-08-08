import type {SessionUser} from '../../shared/api';
import type {
  GroupSummary,
  MediaSummary,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  ProjectWriteRequest,
  YearSummary,
} from '../../shared/projects';
import {ServiceError} from '../services/errors';
import {
  currentYearIdSql,
  effectiveYearFlags,
  getEffectiveYearFlags,
  type StoredYearFlags,
} from './years';

interface UserContext {
  id: string;
  role: SessionUser['role'];
}

interface ProjectRow {
  id: string;
  year_id: string;
  creator_id: string;
  name: string;
  summary: string | null;
  repository: string | null;
  kind: 'project' | 'idea';
  needs_help: number;
  help_details: string | null;
  created_at: string;
  updated_at: string;
  group_id: string | null;
  group_name: string | null;
  creator_email: string;
  creator_name: string;
  creator_avatar: string | null;
  creator_admin: number;
  media_count: number;
}

interface MemberRow {
  project_id: string;
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: number;
}

interface MediaRow {
  id: string;
  original_name: string;
  media_type: string | null;
  size_bytes: number | null;
  status: MediaSummary['status'];
  created_at: string;
}

export async function listYears(db: D1Database): Promise<YearSummary[]> {
  const {results} = await db
    .prepare(
      `SELECT y.id, y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id,
        SUM(CASE WHEN p.status = 'active' AND p.kind = 'project' THEN 1 ELSE 0 END) project_count,
        SUM(CASE WHEN p.status = 'active' AND p.kind = 'idea' THEN 1 ELSE 0 END) idea_count,
        (SELECT COUNT(*) FROM groups g WHERE g.year_id = y.id) group_count,
        (SELECT COUNT(DISTINCT pm.user_id)
         FROM project_members pm JOIN projects participant_project ON participant_project.id = pm.project_id
         WHERE participant_project.year_id = y.id AND participant_project.status = 'active') participant_count
       FROM years y
       LEFT JOIN projects p ON p.year_id = y.id
       GROUP BY y.id
       ORDER BY y.id DESC`,
    )
    .all<{
      id: string;
      voting_enabled: number;
      submissions_closed: number;
      current_year_id: string;
      project_count: number;
      idea_count: number;
      group_count: number;
      participant_count: number;
    }>();
  return results.map(mapYear);
}

export async function getYear(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT y.id, y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id,
        (SELECT COUNT(*) FROM projects p WHERE p.year_id = y.id AND p.status = 'active' AND p.kind = 'project') project_count,
        (SELECT COUNT(*) FROM projects p WHERE p.year_id = y.id AND p.status = 'active' AND p.kind = 'idea') idea_count,
        (SELECT COUNT(*) FROM groups g WHERE g.year_id = y.id) group_count,
        (SELECT COUNT(DISTINCT pm.user_id)
         FROM project_members pm JOIN projects participant_project ON participant_project.id = pm.project_id
         WHERE participant_project.year_id = y.id AND participant_project.status = 'active') participant_count
       FROM years y WHERE y.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      voting_enabled: number;
      submissions_closed: number;
      current_year_id: string;
      project_count: number;
      idea_count: number;
      group_count: number;
      participant_count: number;
    }>();
  if (!row) {
    throw new ServiceError('NOT_FOUND', 'Year not found', 404);
  }
  return mapYear(row);
}

export async function listGroups(db: D1Database, yearId: string) {
  await getYear(db, yearId);
  const {results} = await db
    .prepare(
      `SELECT g.id, g.year_id, g.name,
        COUNT(CASE WHEN p.status = 'active' AND p.kind = 'project' THEN 1 END) project_count
       FROM groups g LEFT JOIN projects p ON p.group_id = g.id
       WHERE g.year_id = ? GROUP BY g.id ORDER BY g.name COLLATE NOCASE, g.id`,
    )
    .bind(yearId)
    .all<{id: string; year_id: string; name: string; project_count: number}>();
  return results.map(mapGroup);
}

export async function listProjectOptions(db: D1Database, yearId: string) {
  const [groups, users] = await Promise.all([
    listGroups(db, yearId),
    db
      .prepare(
        `SELECT id, email, display_name, avatar_url, is_admin
         FROM users ORDER BY display_name COLLATE NOCASE, id`,
      )
      .all<Omit<MemberRow, 'project_id'>>(),
  ]);
  return {groups, users: users.results.map(mapMember)};
}

export async function listProjects(
  db: D1Database,
  options: {
    yearId: string;
    kind?: 'project' | 'idea';
    groupId?: string;
    limit: number;
    offset: number;
  },
) {
  await getYear(db, options.yearId);
  const conditions = ['p.year_id = ?', "p.status = 'active'"];
  const bindings: unknown[] = [options.yearId];
  if (options.kind) {
    conditions.push('p.kind = ?');
    bindings.push(options.kind);
  }
  if (options.groupId) {
    conditions.push('p.group_id = ?');
    bindings.push(options.groupId);
  }
  bindings.push(options.limit + 1, options.offset);

  const {results} = await db
    .prepare(
      `${projectSelect()} WHERE ${conditions.join(' AND ')}
       ORDER BY p.needs_help DESC, p.name COLLATE NOCASE, p.id LIMIT ? OFFSET ?`,
    )
    .bind(...bindings)
    .all<ProjectRow>();
  const page = results.slice(0, options.limit);
  const members = await membersByProjectIds(
    db,
    page.map(({id}) => id),
  );
  return {
    projects: page.map((row) => mapProject(row, members.get(row.id) ?? [])),
    nextCursor:
      results.length > options.limit ? String(options.offset + options.limit) : null,
  };
}

export async function getProject(
  db: D1Database,
  projectId: string,
  user: UserContext,
): Promise<ProjectDetail> {
  const row = await db
    .prepare(`${projectSelect()} WHERE p.id = ? AND p.status = 'active'`)
    .bind(projectId)
    .first<ProjectRow>();
  if (!row) {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  const [members, mediaResult, year] = await Promise.all([
    membersByProjectIds(db, [projectId]),
    db
      .prepare(
        `SELECT id, original_name, media_type, size_bytes, status, created_at
         FROM media WHERE project_id = ? ORDER BY created_at, id`,
      )
      .bind(projectId)
      .all<MediaRow>(),
    getYear(db, row.year_id),
  ]);
  const projectMembers = members.get(projectId) ?? [];
  const isMember = projectMembers.some(({id}) => id === user.id);
  const isAdmin = user.role === 'admin';
  const isCreator = row.creator_id === user.id;
  const canWrite = !year.submissionsClosed && (isAdmin || isMember || isCreator);
  const project = mapProject(row, projectMembers);
  return {
    ...project,
    media: mediaResult.results.map(mapMedia),
    permissions: {
      canEdit: canWrite,
      canDelete: !year.submissionsClosed && (isAdmin || row.creator_id === user.id),
      canClaim:
        !year.submissionsClosed && row.kind === 'idea' && projectMembers.length === 0,
      canManageMedia: canWrite && row.kind === 'project',
    },
  };
}

export async function createProject(
  db: D1Database,
  input: ProjectWriteRequest,
  user: UserContext,
) {
  await assertOpenYearAndReferences(db, input, user.id);
  const id = crypto.randomUUID();
  const memberIds = input.kind === 'project' ? unique([user.id, ...input.memberIds]) : [];
  await assertUsersExist(db, memberIds);
  const statements = [
    db
      .prepare(
        `INSERT INTO projects
          (id, source_id, year_id, creator_id, group_id, name, summary, repository,
           kind, needs_help, help_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        id,
        input.yearId,
        user.id,
        input.groupId,
        input.name,
        input.summary,
        input.repository,
        input.kind,
        Number(input.needsHelp),
        input.helpDetails,
      ),
    ...memberIds.map((memberId) =>
      db
        .prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)')
        .bind(id, memberId),
    ),
  ];
  await db.batch(statements);
  return getProject(db, id, user);
}

export async function updateProject(
  db: D1Database,
  projectId: string,
  input: ProjectWriteRequest,
  user: UserContext,
) {
  const existing = await editableProject(db, projectId, user);
  if (existing.year_id !== input.yearId) {
    throw new ServiceError('VALIDATION_FAILED', 'A project cannot change years', 400);
  }
  if (existing.kind !== input.kind) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'Use the claim action to turn an idea into a project',
      400,
    );
  }
  await assertOpenYearAndReferences(db, input, user.id);
  const memberIds = input.kind === 'project' ? unique(input.memberIds) : [];
  await assertUsersExist(db, memberIds);
  await db.batch([
    db
      .prepare(
        `UPDATE projects SET group_id = ?, name = ?, summary = ?, repository = ?,
          needs_help = ?, help_details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(
        input.groupId,
        input.name,
        input.summary,
        input.repository,
        Number(input.needsHelp),
        input.helpDetails,
        projectId,
      ),
    db.prepare('DELETE FROM project_members WHERE project_id = ?').bind(projectId),
    ...memberIds.map((memberId) =>
      db
        .prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)')
        .bind(projectId, memberId),
    ),
  ]);
  return getProject(db, projectId, user);
}

export async function claimProject(
  db: D1Database,
  projectId: string,
  input: ProjectWriteRequest,
  user: UserContext,
) {
  if (input.kind !== 'project') {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'A claimed idea must become a project',
      400,
    );
  }
  const existing = await db
    .prepare(
      `SELECT p.year_id, p.kind, y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) member_count
       FROM projects p JOIN years y ON y.id = p.year_id
       WHERE p.id = ? AND p.status = 'active'`,
    )
    .bind(projectId)
    .first<{
      year_id: string;
      kind: string;
      voting_enabled: number;
      submissions_closed: number;
      current_year_id: string;
      member_count: number;
    }>();
  if (!existing) {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  if (existing.kind !== 'idea' || existing.member_count !== 0) {
    throw new ServiceError('CONFLICT', 'This idea has already been claimed', 409);
  }
  if (effectiveYearFlags(existing.year_id, existing).submissionsClosed) {
    throw new ServiceError('AUTH_FORBIDDEN', 'Submissions are closed', 403);
  }
  if (existing.year_id !== input.yearId) {
    throw new ServiceError('VALIDATION_FAILED', 'A project cannot change years', 400);
  }
  await assertOpenYearAndReferences(db, input, user.id);
  const memberIds = unique([user.id, ...input.memberIds]);
  await assertUsersExist(db, memberIds);
  const claimMarker = new Date().toISOString();
  const result = await db.batch([
    db
      .prepare(
        `UPDATE projects SET kind = 'project', group_id = ?, name = ?, summary = ?,
          repository = ?, needs_help = ?, help_details = ?, updated_at = ?
         WHERE id = ? AND kind = 'idea'
           AND NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = ?)`,
      )
      .bind(
        input.groupId,
        input.name,
        input.summary,
        input.repository,
        Number(input.needsHelp),
        input.helpDetails,
        claimMarker,
        projectId,
        projectId,
      ),
    ...memberIds.map((memberId) =>
      db
        .prepare(
          `INSERT INTO project_members (project_id, user_id)
           SELECT ?, ? WHERE EXISTS (
             SELECT 1 FROM projects WHERE id = ? AND kind = 'project' AND updated_at = ?
           )`,
        )
        .bind(projectId, memberId, projectId, claimMarker),
    ),
  ]);
  if (!result[0].meta.changes) {
    throw new ServiceError('CONFLICT', 'This idea has already been claimed', 409);
  }
  return getProject(db, projectId, user);
}

export async function deleteProject(
  db: D1Database,
  projectId: string,
  user: UserContext,
) {
  const project = await db
    .prepare(
      `SELECT p.year_id, p.creator_id, y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id
       FROM projects p JOIN years y ON y.id = p.year_id
       WHERE p.id = ? AND p.status = 'active'`,
    )
    .bind(projectId)
    .first<StoredYearFlags & {year_id: string; creator_id: string}>();
  if (!project) {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  if (effectiveYearFlags(project.year_id, project).submissionsClosed) {
    throw new ServiceError('AUTH_FORBIDDEN', 'Submissions are closed', 403);
  }
  if (user.role !== 'admin' && project.creator_id !== user.id) {
    throw new ServiceError(
      'AUTH_FORBIDDEN',
      'Only the creator or an admin can delete this project',
      403,
    );
  }
  await db
    .prepare(
      `UPDATE projects SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
    .bind(projectId)
    .run();
}

async function editableProject(db: D1Database, projectId: string, user: UserContext) {
  const project = await db
    .prepare(
      `SELECT p.year_id, p.kind, y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id, p.creator_id,
        EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?) is_member
       FROM projects p JOIN years y ON y.id = p.year_id
       WHERE p.id = ? AND p.status = 'active'`,
    )
    .bind(user.id, projectId)
    .first<{
      year_id: string;
      kind: ProjectWriteRequest['kind'];
      voting_enabled: number;
      submissions_closed: number;
      current_year_id: string;
      creator_id: string;
      is_member: number;
    }>();
  if (!project) {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  if (effectiveYearFlags(project.year_id, project).submissionsClosed) {
    throw new ServiceError('AUTH_FORBIDDEN', 'Submissions are closed', 403);
  }
  if (user.role !== 'admin' && !project.is_member && project.creator_id !== user.id) {
    throw new ServiceError(
      'AUTH_FORBIDDEN',
      'Project membership or creator permission is required',
      403,
    );
  }
  return project;
}

async function assertOpenYearAndReferences(
  db: D1Database,
  input: ProjectWriteRequest,
  actorId: string,
) {
  const year = await getEffectiveYearFlags(db, input.yearId);
  if (!year) {
    throw new ServiceError('VALIDATION_FAILED', 'Year does not exist', 400);
  }
  if (year.submissionsClosed) {
    throw new ServiceError('AUTH_FORBIDDEN', 'Submissions are closed', 403);
  }
  if (input.groupId) {
    const group = await db
      .prepare('SELECT 1 present FROM groups WHERE id = ? AND year_id = ?')
      .bind(input.groupId, input.yearId)
      .first();
    if (!group) {
      throw new ServiceError(
        'VALIDATION_FAILED',
        'Group does not belong to this year',
        400,
      );
    }
  }
  await assertUsersExist(db, unique([actorId, ...input.memberIds]));
}

async function assertUsersExist(db: D1Database, ids: string[]) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const row = await db
    .prepare(`SELECT COUNT(*) count FROM users WHERE id IN (${placeholders})`)
    .bind(...ids)
    .first<{count: number}>();
  if (row?.count !== ids.length) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'One or more team members do not exist',
      400,
    );
  }
}

async function membersByProjectIds(db: D1Database, ids: string[]) {
  const result = new Map<string, ProjectMember[]>();
  if (!ids.length) return result;
  const placeholders = ids.map(() => '?').join(',');
  const {results} = await db
    .prepare(
      `SELECT pm.project_id, u.id, u.email, u.display_name, u.avatar_url, u.is_admin
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id IN (${placeholders})
       ORDER BY u.display_name COLLATE NOCASE, u.id`,
    )
    .bind(...ids)
    .all<MemberRow>();
  for (const row of results) {
    const members = result.get(row.project_id) ?? [];
    members.push(mapMember(row));
    result.set(row.project_id, members);
  }
  return result;
}

function projectSelect() {
  return `SELECT p.id, p.year_id, p.creator_id, p.name, p.summary, p.repository,
    p.kind, p.needs_help, p.help_details, p.created_at, p.updated_at,
    g.id group_id, g.name group_name,
    u.email creator_email, u.display_name creator_name,
    u.avatar_url creator_avatar, u.is_admin creator_admin,
    (SELECT COUNT(*) FROM media m WHERE m.project_id = p.id AND m.status = 'available') media_count
   FROM projects p JOIN users u ON u.id = p.creator_id
   LEFT JOIN groups g ON g.id = p.group_id`;
}

function mapProject(row: ProjectRow, members: ProjectMember[]): ProjectSummary {
  return {
    id: row.id,
    yearId: row.year_id,
    name: row.name,
    summary: row.summary ?? '',
    repository: row.repository,
    kind: row.kind,
    needsHelp: Boolean(row.needs_help),
    helpDetails: row.help_details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: {
      id: row.creator_id,
      email: row.creator_email,
      displayName: row.creator_name,
      avatarUrl: row.creator_avatar,
      role: row.creator_admin ? 'admin' : 'member',
      actualRole: row.creator_admin ? 'admin' : 'member',
    },
    group:
      row.group_id && row.group_name
        ? {id: row.group_id, yearId: row.year_id, name: row.group_name, projectCount: 0}
        : null,
    members,
    mediaCount: row.media_count,
  };
}

function mapYear(row: {
  id: string;
  voting_enabled: number;
  submissions_closed: number;
  current_year_id: string;
  project_count: number;
  idea_count: number;
  group_count: number;
  participant_count: number;
}): YearSummary {
  const flags = effectiveYearFlags(row.id, row);
  return {
    id: row.id,
    votingEnabled: flags.votingEnabled,
    submissionsClosed: flags.submissionsClosed,
    isCurrent: flags.isCurrent,
    projectCount: row.project_count,
    ideaCount: row.idea_count,
    groupCount: row.group_count,
    participantCount: row.participant_count,
  };
}

function mapGroup(row: {
  id: string;
  year_id: string;
  name: string;
  project_count: number;
}): GroupSummary {
  return {
    id: row.id,
    yearId: row.year_id,
    name: row.name,
    projectCount: row.project_count,
  };
}

function mapMember(row: Omit<MemberRow, 'project_id'>): ProjectMember {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.is_admin ? 'admin' : 'member',
    actualRole: row.is_admin ? 'admin' : 'member',
  };
}

function mapMedia(row: MediaRow): MediaSummary {
  return {
    id: row.id,
    originalName: row.original_name,
    mediaType: row.media_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    createdAt: row.created_at,
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}
