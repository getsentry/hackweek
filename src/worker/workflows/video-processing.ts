import {getContainer} from '@cloudflare/containers';
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';

import {VideoProcessorContainer} from '../containers/video-processor';
import {
  claimVideoProcessingAttempt,
  failVideoProcessingAttempt,
  publishVideoProcessingAttempt,
} from '../services/videos';
import {
  VIDEO_PROCESSOR_LOUDNESS_TOLERANCE_LU,
  VIDEO_PROCESSOR_MAX_DURATION_SECONDS,
  VIDEO_PROCESSOR_TARGET_LUFS,
  type VideoProcessingParams,
  type VideoProcessorResult,
} from '../video-processing';

export interface VideoProcessingEnvironment {
  DB: D1Database;
  VIDEOS: R2Bucket;
  VIDEO_PROCESSOR: DurableObjectNamespace<VideoProcessorContainer>;
  VIDEO_PROCESSOR_CONCURRENCY: string;
}

export class VideoProcessingWorkflow extends WorkflowEntrypoint<
  VideoProcessingEnvironment,
  VideoProcessingParams
> {
  async run(event: WorkflowEvent<VideoProcessingParams>, step: WorkflowStep) {
    const {videoId, attempt} = event.payload;
    let claim: Exclude<
      Awaited<ReturnType<typeof claimVideoProcessingAttempt>>,
      {status: 'capacity'}
    >;
    for (;;) {
      let candidate: Awaited<ReturnType<typeof claimVideoProcessingAttempt>>;
      try {
        candidate = await step.do(
          'claim current processing attempt',
          {
            retries: {limit: 5, delay: '2 seconds', backoff: 'constant'},
            timeout: '30 seconds',
          },
          () =>
            claimVideoProcessingAttempt(
              this.env.DB,
              videoId,
              attempt,
              processingConcurrency(this.env.VIDEO_PROCESSOR_CONCURRENCY),
            ),
        );
      } catch (error) {
        const message = errorMessage(error);
        logVideoProcessing('error', 'claim_failed', {videoId, attempt, message});
        await step.do('record claim failure', () =>
          failVideoProcessingAttempt(this.env.DB, videoId, attempt, message),
        );
        return {status: 'failed', stage: 'claim'};
      }
      if (candidate.status === 'capacity') {
        logVideoProcessing('info', 'waiting_for_capacity', {videoId, attempt});
        await step.sleep('wait for processing capacity', '15 seconds');
        continue;
      }
      claim = candidate;
      break;
    }
    if (claim.status === 'stale') {
      logVideoProcessing('info', 'stale_before_processing', {videoId, attempt});
      return {status: 'stale'};
    }
    logVideoProcessing('info', 'processing_started', {videoId, attempt});

    let result: VideoProcessorResult;
    try {
      result = await step.do(
        'run pinned ffmpeg processor',
        {
          retries: {limit: 1, delay: '2 seconds', backoff: 'constant'},
          timeout: '30 minutes',
        },
        async () => {
          const container = getContainer(
            this.env.VIDEO_PROCESSOR,
            `${videoId}-attempt-${attempt}`,
          );
          await container.setOutboundByHost('video-r2', 'videoR2', {videoId, attempt});
          const response = await container.fetch('http://container/process', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({videoId, attempt}),
          });
          if (!response.ok) {
            const body = await response.text();
            throw new Error(`FFmpeg processor returned ${response.status}: ${body}`);
          }
          return parseProcessorResult(await response.json());
        },
      );
    } catch (error) {
      const message = errorMessage(error);
      logVideoProcessing('error', 'processor_failed', {videoId, attempt, message});
      await step.do('record processor failure', () =>
        failVideoProcessingAttempt(this.env.DB, videoId, attempt, message),
      );
      return {status: 'failed', stage: 'processor'};
    }

    const published = await step.do('publish only if attempt is current', () =>
      publishVideoProcessingAttempt(
        this.env.DB,
        videoId,
        attempt,
        claim.outputKey,
        result,
      ),
    );
    logVideoProcessing(
      'info',
      published ? 'processing_ready' : 'stale_after_processing',
      {
        videoId,
        attempt,
        durationSeconds: result.durationSeconds,
      },
    );
    return {status: published ? 'ready' : 'stale', result};
  }
}

function processingConcurrency(value: string) {
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) {
    throw new Error('VIDEO_PROCESSOR_CONCURRENCY must be 1 or 2');
  }
  return concurrency;
}

function parseProcessorResult(value: unknown): VideoProcessorResult {
  if (!value || typeof value !== 'object') throw invalidProcessorResult();
  const result = value as Record<string, unknown>;
  const loudness = result.loudnessLufs;
  if (
    !finitePositive(result.durationSeconds) ||
    (result.durationSeconds as number) > VIDEO_PROCESSOR_MAX_DURATION_SECONDS + 0.05 ||
    !integerBetween(result.width, 1, 1920) ||
    !integerBetween(result.height, 1, 1080) ||
    result.videoCodec !== 'h264' ||
    result.audioCodec !== 'aac' ||
    result.pixelFormat !== 'yuv420p' ||
    result.fastStart !== true ||
    result.loudnessTargetLufs !== VIDEO_PROCESSOR_TARGET_LUFS ||
    result.loudnessToleranceLu !== VIDEO_PROCESSOR_LOUDNESS_TOLERANCE_LU ||
    !['normalized', 'generated-silence'].includes(String(result.audioMode)) ||
    typeof result.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.sha256) ||
    (loudness !== null && typeof loudness !== 'number')
  ) {
    throw invalidProcessorResult();
  }
  if (
    result.audioMode === 'normalized' &&
    (typeof loudness !== 'number' ||
      !Number.isFinite(loudness) ||
      Math.abs(loudness - VIDEO_PROCESSOR_TARGET_LUFS) >
        VIDEO_PROCESSOR_LOUDNESS_TOLERANCE_LU)
  ) {
    throw invalidProcessorResult();
  }
  return result as unknown as VideoProcessorResult;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function integerBetween(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function invalidProcessorResult() {
  return new Error('FFmpeg processor returned invalid canonical metadata');
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function logVideoProcessing(
  level: 'info' | 'error',
  event: string,
  fields: Record<string, unknown>,
) {
  console[level](JSON.stringify({component: 'video-processing', event, ...fields}));
}
