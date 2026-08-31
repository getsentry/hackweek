import type {AnalyticsVideoExportRow} from './administration';

export const ANALYTICS_VIDEO_EXPORT_HEADERS = [
  'vote_rank',
  'total_votes',
  'project_name',
  'project_url',
  'video_url',
  'video_id',
  'original_name',
  'duration_seconds',
  'description',
  'team_members',
  'awards',
  'category_votes',
] as const;

export interface AnalyticsVideoExportSource {
  projectId: string;
  projectName: string;
  summary: string | null;
  videoId: string;
  originalName: string;
  durationSeconds: number | null;
  teamMembers: string[];
  awards: string[];
  /** category display name → vote count */
  categoryVotes: Array<{categoryName: string; voteCount: number}>;
}

/** Competition rank: ties share a rank, next rank skips (1, 2, 2, 4). */
export function assignVoteRanks<T extends {totalVotes: number}>(
  rows: T[],
): Array<T & {voteRank: number}> {
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.totalVotes !== rows[index - 1]?.totalVotes) {
      rank = index + 1;
    }
    return {...row, voteRank: rank};
  });
}

export function buildAnalyticsVideoExportRows(
  yearId: string,
  sources: AnalyticsVideoExportSource[],
): AnalyticsVideoExportRow[] {
  const sorted = [...sources]
    .map((source) => ({
      ...source,
      totalVotes: source.categoryVotes.reduce((sum, item) => sum + item.voteCount, 0),
    }))
    .sort(
      (left, right) =>
        right.totalVotes - left.totalVotes ||
        left.projectName.localeCompare(right.projectName) ||
        left.projectId.localeCompare(right.projectId),
    );

  return assignVoteRanks(sorted).map((source) => ({
    voteRank: source.voteRank,
    totalVotes: source.totalVotes,
    projectId: source.projectId,
    projectName: source.projectName,
    projectUrl: `/years/${yearId}/projects/${source.projectId}`,
    videoId: source.videoId,
    videoUrl: `/years/${yearId}/watch/${source.videoId}`,
    originalName: source.originalName,
    durationSeconds: source.durationSeconds,
    description: source.summary?.trim() || '',
    teamMembers: source.teamMembers.join('; '),
    awards: source.awards.join('; '),
    categoryVotes: [...source.categoryVotes]
      .sort(
        (left, right) =>
          right.voteCount - left.voteCount ||
          left.categoryName.localeCompare(right.categoryName),
      )
      .map((item) => `${item.categoryName}:${item.voteCount}`)
      .join('; '),
  }));
}

export function formatAnalyticsVideoExportCsv(rows: AnalyticsVideoExportRow[]): string {
  const lines = [
    ANALYTICS_VIDEO_EXPORT_HEADERS.join(','),
    ...rows.map((row) =>
      [
        row.voteRank,
        row.totalVotes,
        row.projectName,
        row.projectUrl,
        row.videoUrl,
        row.videoId,
        row.originalName,
        row.durationSeconds ?? '',
        row.description,
        row.teamMembers,
        row.awards,
        row.categoryVotes,
      ]
        .map(escapeCsvField)
        .join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function analyticsVideoExportFilename(yearId: string) {
  return `hackweek-${yearId}-ready-videos.csv`;
}

function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
