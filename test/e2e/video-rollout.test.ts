import {readFile} from 'node:fs/promises';

import {describe, expect, it} from 'vitest';

interface WranglerConfig {
  r2_buckets: Array<{binding: string; bucket_name: string}>;
  workflows: Array<{binding: string; name: string; class_name: string}>;
  containers: Array<{
    name: string;
    class_name: string;
    image: string;
    max_instances: number;
  }>;
  vars: Record<string, string>;
  observability: {enabled: boolean};
}

describe('video rollout preparation', () => {
  it('declares isolated production video resources with concurrency capped at two', async () => {
    const config = JSON.parse(
      await readFile('wrangler.production.json', 'utf8'),
    ) as WranglerConfig;

    expect(config.r2_buckets.find(({binding}) => binding === 'VIDEOS')).toEqual({
      binding: 'VIDEOS',
      bucket_name: 'hackweek-video-media-production',
    });
    expect(
      config.workflows.find(({binding}) => binding === 'VIDEO_PROCESSING_WORKFLOW'),
    ).toMatchObject({
      name: 'hackweek-video-processing-production',
      class_name: 'VideoProcessingWorkflow',
    });
    expect(
      config.containers.find(({class_name}) => class_name === 'VideoProcessorContainer'),
    ).toMatchObject({
      name: 'hackweek-video-processor-production',
      image: './Dockerfile.video-processor',
      max_instances: 2,
    });
    expect(config.vars).toMatchObject({
      VIDEO_PROCESSOR_CONCURRENCY: '2',
      VIDEO_PROCESSING_AUTOSTART: 'true',
    });
    expect(config.vars).not.toHaveProperty('STREAM_MODE');
    expect(config.observability.enabled).toBe(true);
  });

  it('pins both processor image stages by digest', async () => {
    const dockerfile = await readFile('Dockerfile.video-processor', 'utf8');
    const stages = dockerfile.match(/^FROM .+@sha256:[a-f0-9]{64}.*$/gm) ?? [];
    expect(stages).toHaveLength(2);
    expect(dockerfile).toContain('mwader/static-ffmpeg:8.0.1@sha256:');
    expect(dockerfile).toContain('node:24.11.0-bookworm-slim@sha256:');
  });

  it('keeps readiness on real bytes and lifecycle APIs rather than fake readiness', async () => {
    const readiness = await readFile('scripts/local-readiness.ts', 'utf8');
    expect(readiness).toContain("'wrangler',\n    'workflows'");
    expect(readiness).toContain('/parts/1');
    expect(readiness).toContain('headers: {Range:');
    expect(readiness).toContain('/api/videos/playlist?year=9999');
    expect(readiness).toContain("output('ffprobe'");
    expect(readiness).not.toContain('STREAM_MODE');
    expect(readiness).not.toMatch(/UPDATE video_submissions SET status\s*=\s*'ready'/);
  });

  it('documents retained storage and the explicit production approval boundary', async () => {
    const runbook = await readFile('VIDEO_ROLLOUT.md', 'utf8');
    expect(runbook).toContain('Explicit approval boundary');
    expect(runbook).toContain('max_instances: 2');
    expect(runbook).toContain('No automatic deletion');
    expect(runbook).toContain('hackweek-video-media-production');
  });

  it('keeps migration, deployment, rollback, and future contraction compatible', async () => {
    const [migration, workflow, runbook] = await Promise.all([
      readFile('migrations/0007_r2_video_lifecycle.sql', 'utf8'),
      readFile('.github/workflows/deploy.yml', 'utf8'),
      readFile('VIDEO_ROLLOUT.md', 'utf8'),
    ]);

    expect(migration).toContain('CREATE TABLE video_submissions');
    expect(migration).not.toMatch(/ALTER TABLE project_videos|DROP TABLE stream_events/);
    expect(workflow).toContain('Apply expand-compatible D1 migrations');
    expect(workflow.indexOf('Apply expand-compatible D1 migrations')).toBeLessThan(
      workflow.indexOf('Deploy Worker and static assets'),
    );
    expect(runbook).toContain('recorded pre-release Worker version');
    expect(runbook).toContain('does not alter `project_videos` or `stream_events`');
    expect(runbook).toContain('Future contraction (separate approval required)');
  });
});
