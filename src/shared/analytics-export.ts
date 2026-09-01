import type {AnalyticsProjectExportRow, AnalyticsYearExportRow} from './administration';

export const ANALYTICS_YEAR_EXPORT_HEADERS = [
  'year',
  'active_voters',
  'votes',
  'projects',
  'ideas',
  'participants',
  'ready_videos',
  'award_categories',
  'awards',
] as const;

export const ANALYTICS_PROJECT_EXPORT_HEADERS = [
  'vote_rank',
  'total_votes',
  'project_name',
  'project_url',
  'kind',
  'group_name',
  'description',
  'team_members',
  'awards',
  'category_votes',
  'has_ready_video',
  'video_id',
  'video_url',
  'original_name',
  'duration_seconds',
] as const;

export interface AnalyticsYearExportSource {
  yearId: string;
  activeVoters: number;
  voteCount: number;
  projectCount: number;
  ideaCount: number;
  participantCount: number;
  readyVideoCount: number;
  categoryCount: number;
  awardCount: number;
}

export interface AnalyticsProjectExportSource {
  projectId: string;
  projectName: string;
  kind: 'project' | 'idea';
  groupName: string | null;
  summary: string | null;
  teamMembers: string[];
  awards: string[];
  categoryVotes: Array<{categoryName: string; voteCount: number}>;
  videoId: string | null;
  originalName: string | null;
  durationSeconds: number | null;
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

export function buildAnalyticsYearExportRows(
  sources: AnalyticsYearExportSource[],
): AnalyticsYearExportRow[] {
  return [...sources]
    .sort((left, right) => left.yearId.localeCompare(right.yearId))
    .map((source) => ({
      yearId: source.yearId,
      activeVoters: source.activeVoters,
      voteCount: source.voteCount,
      projectCount: source.projectCount,
      ideaCount: source.ideaCount,
      participantCount: source.participantCount,
      readyVideoCount: source.readyVideoCount,
      categoryCount: source.categoryCount,
      awardCount: source.awardCount,
    }));
}

export function buildAnalyticsProjectExportRows(
  yearId: string,
  sources: AnalyticsProjectExportSource[],
): AnalyticsProjectExportRow[] {
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

  return assignVoteRanks(sorted).map((source) => {
    const hasReadyVideo = Boolean(source.videoId);
    return {
      voteRank: source.voteRank,
      totalVotes: source.totalVotes,
      projectId: source.projectId,
      projectName: source.projectName,
      projectUrl: `/years/${yearId}/projects/${source.projectId}`,
      kind: source.kind,
      groupName: source.groupName ?? '',
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
      hasReadyVideo,
      videoId: source.videoId ?? '',
      videoUrl: source.videoId ? `/years/${yearId}/watch/${source.videoId}` : '',
      originalName: source.originalName ?? '',
      durationSeconds: source.durationSeconds,
    };
  });
}

export function formatAnalyticsYearExportCsv(rows: AnalyticsYearExportRow[]): string {
  const lines = [
    ANALYTICS_YEAR_EXPORT_HEADERS.join(','),
    ...rows.map((row) =>
      [
        row.yearId,
        row.activeVoters,
        row.voteCount,
        row.projectCount,
        row.ideaCount,
        row.participantCount,
        row.readyVideoCount,
        row.categoryCount,
        row.awardCount,
      ]
        .map(escapeCsvField)
        .join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function formatAnalyticsProjectExportCsv(
  rows: AnalyticsProjectExportRow[],
): string {
  const lines = [
    ANALYTICS_PROJECT_EXPORT_HEADERS.join(','),
    ...rows.map((row) =>
      [
        row.voteRank,
        row.totalVotes,
        row.projectName,
        row.projectUrl,
        row.kind,
        row.groupName,
        row.description,
        row.teamMembers,
        row.awards,
        row.categoryVotes,
        row.hasReadyVideo ? 'yes' : 'no',
        row.videoId,
        row.videoUrl,
        row.originalName,
        row.durationSeconds ?? '',
      ]
        .map(escapeCsvField)
        .join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function analyticsYearExportFilename() {
  return 'hackweek-year-metrics.csv';
}

export function analyticsProjectExportFilename(yearId: string) {
  return `hackweek-${yearId}-projects.csv`;
}

function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
