import type {GroupSummary} from '../../shared/projects';
import {ServiceError} from '../services/errors';
import {getYear} from './projects';

export async function createGroup(
  db: D1Database,
  yearId: string,
  name: string,
  creatorId: string,
): Promise<GroupSummary> {
  await getYear(db, yearId);
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO groups (id, source_id, year_id, name, creator_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, id, yearId, name, creatorId)
      .run();
  } catch (error) {
    throw constraintError(error);
  }
  return {id, yearId, name, projectCount: 0};
}

export async function updateGroup(
  db: D1Database,
  groupId: string,
  name: string,
): Promise<GroupSummary> {
  let result: D1Result;
  try {
    result = await db
      .prepare(`UPDATE groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(name, groupId)
      .run();
  } catch (error) {
    throw constraintError(error);
  }
  if (!result.meta.changes) {
    throw new ServiceError('NOT_FOUND', 'Group not found', 404);
  }
  const row = await db
    .prepare(
      `SELECT g.id, g.year_id, g.name, COUNT(p.id) project_count
       FROM groups g LEFT JOIN projects p
         ON p.group_id = g.id AND p.status = 'active' AND p.kind = 'project'
       WHERE g.id = ? GROUP BY g.id`,
    )
    .bind(groupId)
    .first<{id: string; year_id: string; name: string; project_count: number}>();
  return {
    id: row!.id,
    yearId: row!.year_id,
    name: row!.name,
    projectCount: row!.project_count,
  };
}

export async function deleteGroup(db: D1Database, groupId: string) {
  const group = await db
    .prepare('SELECT id FROM groups WHERE id = ?')
    .bind(groupId)
    .first();
  if (!group) {
    throw new ServiceError('NOT_FOUND', 'Group not found', 404);
  }
  await db.batch([
    db
      .prepare(
        `UPDATE projects SET group_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE group_id = ?`,
      )
      .bind(groupId),
    db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId),
  ]);
}

function constraintError(error: unknown) {
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    return new ServiceError(
      'CONFLICT',
      'A group with this identifier already exists',
      409,
    );
  }
  return error;
}
