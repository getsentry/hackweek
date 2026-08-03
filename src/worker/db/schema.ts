export const tableNames = [
  'users',
  'years',
  'groups',
  'projects',
  'project_members',
  'award_categories',
  'project_nominations',
  'votes',
  'awards',
  'media',
  'project_videos',
  'stream_events',
] as const;

export type TableName = (typeof tableNames)[number];
