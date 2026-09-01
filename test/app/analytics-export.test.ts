import {describe, expect, it} from 'vitest';

import {
  assignVoteRanks,
  buildAnalyticsProjectExportRows,
  buildAnalyticsYearExportRows,
  formatAnalyticsProjectExportCsv,
  formatAnalyticsYearExportCsv,
} from '../../src/shared/analytics-export';

describe('analytics export helpers', () => {
  it('ranks by total votes with competition ties and stable name ordering', () => {
    const ranked = assignVoteRanks([
      {totalVotes: 5, name: 'b'},
      {totalVotes: 5, name: 'a'},
      {totalVotes: 2, name: 'c'},
    ]);
    expect(ranked.map((row) => row.voteRank)).toEqual([1, 1, 3]);
  });

  it('builds multi-year participation rows without requiring videos', () => {
    const rows = buildAnalyticsYearExportRows([
      {
        yearId: '2026',
        activeVoters: 10,
        voteCount: 40,
        projectCount: 12,
        ideaCount: 3,
        participantCount: 28,
        readyVideoCount: 9,
        categoryCount: 5,
        awardCount: 5,
      },
      {
        yearId: '2025',
        activeVoters: 8,
        voteCount: 30,
        projectCount: 11,
        ideaCount: 2,
        participantCount: 22,
        readyVideoCount: 0,
        categoryCount: 5,
        awardCount: 5,
      },
    ]);

    expect(rows.map((row) => row.yearId)).toEqual(['2025', '2026']);
    const csv = formatAnalyticsYearExportCsv(rows);
    expect(csv.startsWith('year,active_voters,votes,projects,ideas,participants,')).toBe(
      true,
    );
    expect(csv).toContain('2025,8,30,11,2,22,0,5,5');
  });

  it('builds project rows with optional ready-video fields', () => {
    const rows = buildAnalyticsProjectExportRows('2025', [
      {
        projectId: 'no-video',
        projectName: 'Archive only',
        kind: 'project',
        groupName: 'Europe',
        summary: 'Still useful without R2 media',
        teamMembers: ['Sam'],
        awards: ['Craft'],
        categoryVotes: [{categoryName: 'Craft', voteCount: 3}],
        videoId: null,
        originalName: null,
        durationSeconds: null,
      },
      {
        projectId: 'top',
        projectName: 'Top project',
        kind: 'project',
        groupName: null,
        summary: 'A punchy demo, with commas',
        teamMembers: ['Ada', 'Grace'],
        awards: ["Delight: People's choice"],
        categoryVotes: [
          {categoryName: 'Delight', voteCount: 4},
          {categoryName: 'Craft', voteCount: 2},
        ],
        videoId: 'video-top',
        originalName: 'top.mp4',
        durationSeconds: 41.5,
      },
    ]);

    expect(rows.map((row) => [row.voteRank, row.totalVotes, row.projectId])).toEqual([
      [1, 6, 'top'],
      [2, 3, 'no-video'],
    ]);
    expect(rows[0]).toMatchObject({
      hasReadyVideo: true,
      videoUrl: '/years/2025/watch/video-top',
      categoryVotes: 'Delight:4; Craft:2',
    });
    expect(rows[1]).toMatchObject({
      hasReadyVideo: false,
      videoId: '',
      videoUrl: '',
      groupName: 'Europe',
    });

    const csv = formatAnalyticsProjectExportCsv(rows);
    expect(csv.startsWith('vote_rank,total_votes,project_name,')).toBe(true);
    expect(csv).toContain('"A punchy demo, with commas"');
    expect(csv).toContain(',yes,video-top,');
    expect(csv).toContain(',no,,,');
  });
});
