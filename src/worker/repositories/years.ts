export interface StoredYearFlags {
  voting_enabled: number;
  submissions_closed: number;
  current_year_id: string;
}

export interface EffectiveYearFlags {
  votingEnabled: boolean;
  submissionsClosed: boolean;
  isCurrent: boolean;
}

export const currentYearIdSql = '(SELECT MAX(id) FROM years)';

export function effectiveYearFlags(
  yearId: string,
  row: StoredYearFlags,
): EffectiveYearFlags {
  const isCurrent = yearId === row.current_year_id;
  return {
    votingEnabled: isCurrent && Boolean(row.voting_enabled),
    submissionsClosed: !isCurrent || Boolean(row.submissions_closed),
    isCurrent,
  };
}

export async function getEffectiveYearFlags(db: D1Database, yearId: string) {
  const row = await db
    .prepare(
      `SELECT id, voting_enabled, submissions_closed,
       ${currentYearIdSql} current_year_id
       FROM years WHERE id = ?`,
    )
    .bind(yearId)
    .first<StoredYearFlags & {id: string}>();
  return row ? effectiveYearFlags(row.id, row) : null;
}
