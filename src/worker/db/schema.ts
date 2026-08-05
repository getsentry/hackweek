export const tableNames = [
  'users',
  'oauth_login_attempts',
  'user_sessions',
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
  'screening_order',
  'stream_events',
] as const;

export type TableName = (typeof tableNames)[number];
