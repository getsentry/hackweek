import {getContainer} from '@cloudflare/containers';
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';

import {
  isJsonNumber,
  isJsonObject,
  isJsonString,
  type JsonInput,
  type JsonObject,
} from '../../shared/json';
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
    for (;;) {
      let outcome:
        | {status: 'processed'; result: VideoProcessorResult}
        | {status: 'capacity'};
      try {
        outcome = await step.do(
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
            try {
              await container.setOutboundByHost('video-r2', 'videoR2', {
                videoId,
                attempt,
              });
              const response = await container.fetch('http://container/process', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({videoId, attempt}),
              });
              if (!response.ok) {
                const body = await response.text();
                if (isContainerCapacityResponse(response.status, body)) {
                  return {status: 'capacity'} as const;
                }
                throw new Error(`FFmpeg processor returned ${response.status}: ${body}`);
              }
              return {
                status: 'processed',
                result: parseProcessorResult(await response.json()),
              } as const;
            } finally {
              await destroyProcessorContainer(container, videoId, attempt);
            }
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
      if (outcome.status === 'capacity') {
        logVideoProcessing('info', 'waiting_for_container_capacity', {
          videoId,
          attempt,
        });
        await step.sleep('wait for container capacity', '15 seconds');
        continue;
      }
      result = outcome.result;
      break;
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

export function isContainerCapacityResponse(status: number, body: string) {
  return (
    status === 500 &&
    body.includes('Maximum number of running container instances exceeded')
  );
}

async function destroyProcessorContainer(
  container: {destroy(): Promise<void>; stop(): Promise<void>},
  videoId: string,
  attempt: number,
) {
  try {
    await container.destroy();
  } catch (error) {
    logVideoProcessing('error', 'container_destroy_failed', {
      videoId,
      attempt,
      message: errorMessage(error),
    });
    try {
      await container.stop();
    } catch (stopError) {
      logVideoProcessing('error', 'container_stop_failed', {
        videoId,
        attempt,
        message: errorMessage(stopError),
      });
    }
  }
}

function processingConcurrency(value: string) {
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) {
    throw new Error('VIDEO_PROCESSOR_CONCURRENCY must be 1 or 2');
  }
  return concurrency;
}

function parseProcessorResult(value: JsonInput): VideoProcessorResult {
  if (!isJsonObject(value)) throw invalidProcessorResult();
  const loudness = value.loudnessLufs;
  if (
    !finitePositive(value.durationSeconds) ||
    value.durationSeconds > VIDEO_PROCESSOR_MAX_DURATION_SECONDS + 0.05 ||
    !integerBetween(value.width, 1, 1920) ||
    !integerBetween(value.height, 1, 1080) ||
    value.videoCodec !== 'h264' ||
    value.audioCodec !== 'aac' ||
    value.pixelFormat !== 'yuv420p' ||
    value.fastStart !== true ||
    value.loudnessTargetLufs !== VIDEO_PROCESSOR_TARGET_LUFS ||
    value.loudnessToleranceLu !== VIDEO_PROCESSOR_LOUDNESS_TOLERANCE_LU ||
    (value.audioMode !== 'normalized' && value.audioMode !== 'generated-silence') ||
    !isJsonString(value.sha256) ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    (loudness !== null && !isJsonNumber(loudness))
  ) {
    throw invalidProcessorResult();
  }
  if (
    value.audioMode === 'normalized' &&
    (!isJsonNumber(loudness) ||
      !Number.isFinite(loudness) ||
      Math.abs(loudness - VIDEO_PROCESSOR_TARGET_LUFS) >
        VIDEO_PROCESSOR_LOUDNESS_TOLERANCE_LU)
  ) {
    throw invalidProcessorResult();
  }
  return {
    durationSeconds: value.durationSeconds,
    width: value.width,
    height: value.height,
    videoCodec: value.videoCodec,
    audioCodec: value.audioCodec,
    pixelFormat: value.pixelFormat,
    loudnessLufs: loudness,
    loudnessTargetLufs: value.loudnessTargetLufs,
    loudnessToleranceLu: value.loudnessToleranceLu,
    audioMode: value.audioMode,
    fastStart: value.fastStart,
    sha256: value.sha256,
  };
}

function finitePositive(value: JsonInput): value is number {
  return isJsonNumber(value) && Number.isFinite(value) && value > 0;
}

function integerBetween(
  value: JsonInput,
  minimum: number,
  maximum: number,
): value is number {
  return (
    isJsonNumber(value) && Number.isInteger(value) && value >= minimum && value <= maximum
  );
}

function invalidProcessorResult() {
  return new Error('FFmpeg processor returned invalid canonical metadata');
}

function errorMessage(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 500);
}

function logVideoProcessing(level: 'info' | 'error', event: string, fields: JsonObject) {
  console[level](JSON.stringify({component: 'video-processing', event, ...fields}));
}
