import {describe, expect, it} from 'vitest';

import {
  assignVoteRanks,
  buildAnalyticsVideoExportRows,
  formatAnalyticsVideoExportCsv,
} from '../../src/shared/analytics-export';

describe('analytics video export helpers', () => {
  it('ranks by total votes with competition ties and stable name ordering', () => {
    const ranked = assignVoteRanks([
      {totalVotes: 5, name: 'b'},
      {totalVotes: 5, name: 'a'},
      {totalVotes: 2, name: 'c'},
    ]);
    expect(ranked.map((row) => row.voteRank)).toEqual([1, 1, 3]);
  });

  it('builds CSV rows for ready videos with awards and category tallies', () => {
    const rows = buildAnalyticsVideoExportRows('2026', [
      {
        projectId: 'low',
        projectName: 'Low votes',
        summary: 'Quiet demo',
        videoId: 'video-low',
        originalName: 'low.mp4',
        durationSeconds: 12,
        teamMembers: ['Sam'],
        awards: [],
        categoryVotes: [{categoryName: 'Craft', voteCount: 1}],
      },
      {
        projectId: 'top',
        projectName: 'Top project',
        summary: 'A punchy demo, with commas',
        videoId: 'video-top',
        originalName: 'top.mp4',
        durationSeconds: 41.5,
        teamMembers: ['Ada', 'Grace'],
        awards: ["Delight: People's choice"],
        categoryVotes: [
          {categoryName: 'Delight', voteCount: 4},
          {categoryName: 'Craft', voteCount: 2},
        ],
      },
      {
        projectId: 'zero',
        projectName: 'Zero votes',
        summary: null,
        videoId: 'video-zero',
        originalName: 'zero.mp4',
        durationSeconds: null,
        teamMembers: [],
        awards: [],
        categoryVotes: [],
      },
    ]);

    expect(rows.map((row) => [row.voteRank, row.totalVotes, row.projectId])).toEqual([
      [1, 6, 'top'],
      [2, 1, 'low'],
      [3, 0, 'zero'],
    ]);
    expect(rows[0]).toMatchObject({
      projectUrl: '/years/2026/projects/top',
      videoUrl: '/years/2026/watch/video-top',
      teamMembers: 'Ada; Grace',
      awards: "Delight: People's choice",
      categoryVotes: 'Delight:4; Craft:2',
    });

    const csv = formatAnalyticsVideoExportCsv(rows);
    expect(csv.startsWith('vote_rank,total_votes,project_name,')).toBe(true);
    expect(csv).toContain('"A punchy demo, with commas"');
    expect(csv).toContain('/years/2026/watch/video-top');
    expect(csv).toContain(
      '3,0,Zero votes,/years/2026/projects/zero,/years/2026/watch/video-zero,video-zero,zero.mp4,,,',
    );
  });
});
