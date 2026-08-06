import {Hono, type Context} from 'hono';

import type {
  DirectUploadRequest,
  DirectUploadResponse,
  HistoricalPromotionRequest,
  PlaybackResponse,
  PlaylistResponse,
} from '../../shared/videos';
import {
  FakeHistoricalVideoSource,
  R2HistoricalVideoSource,
} from '../integrations/historical-source';
import {streamGateway, streamMode} from '../integrations/stream';
import type {WorkerEnv} from '../index';
import {errorResponse, ServiceError} from '../services/errors';
import {
  createDirectUpload,
  deleteProjectVideo,
  getProjectVideo,
  issuePlayback,
  listPlaylist,
  MAX_VIDEO_BYTES,
  promoteHistoricalVideo,
  retryVideo,
  TUS_CHUNK_SIZE,
} from '../services/videos';

export const videosRoutes = new Hono<WorkerEnv>();

videosRoutes.get('/playlist', async (c) => {
  try {
    const year = c.req.query('year');
    if (!year) throw new ServiceError('VALIDATION_FAILED', 'Year is required', 400);
    const response: PlaylistResponse = {
      videos: await listPlaylist(c.env.DB, year),
      streamMode: streamMode(c.env),
    };
    return c.json(response);
  } catch (error) {
    return respondError(c, error);
  }
});

videosRoutes.get('/:videoId/playback', async (c) => {
  try {
    const response: PlaybackResponse = await issuePlayback(
      c.env.DB,
      streamGateway(c.env),
      c.req.param('videoId'),
      deliveryHost(c.env),
    );
    return c.json(response, 200, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

videosRoutes.post('/:videoId/retry', async (c) => {
  try {
    return c.json({
      video: await retryVideo(c.env.DB, c.req.param('videoId'), c.get('user')),
    });
  } catch (error) {
    return respondError(c, error);
  }
});

export const projectVideoRoutes = new Hono<WorkerEnv>();

projectVideoRoutes.get('/:projectId/video', async (c) => {
  try {
    return c.json({
      video: await getProjectVideo(c.env.DB, c.req.param('projectId')),
      streamMode: streamMode(c.env),
    });
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.post('/:projectId/video/upload', async (c) => {
  try {
    const input = parseUpload(await c.req.json());
    const result = await createDirectUpload(
      c.env.DB,
      streamGateway(c.env),
      c.req.param('projectId'),
      c.get('user'),
      input,
      uploadOrigin(c.env),
    );
    const response: DirectUploadResponse = {
      video: result.video,
      upload: {
        protocol: 'tus',
        url: result.upload.uploadUrl,
        expiresAt: result.upload.expiresAt.toISOString(),
        chunkSize: TUS_CHUNK_SIZE,
      },
    };
    return c.json(response, 201, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.post('/:projectId/video/promote', async (c) => {
  try {
    const input = parsePromotion(await c.req.json());
    const video = await promoteHistoricalVideo(
      c.env.DB,
      streamGateway(c.env),
      historicalSource(c.env),
      c.req.param('projectId'),
      input.sourceMediaId,
      c.get('user'),
      uploadOrigin(c.env),
    );
    return c.json({video}, 201);
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.delete('/:projectId/video', async (c) => {
  try {
    await deleteProjectVideo(
      c.env.DB,
      streamGateway(c.env),
      c.req.param('projectId'),
      c.get('user'),
    );
    return c.body(null, 204);
  } catch (error) {
    return respondError(c, error);
  }
});

function parseUpload(value: unknown): DirectUploadRequest {
  if (!value || typeof value !== 'object') invalid('Request body must be an object');
  const input = value as Record<string, unknown>;
  if (
    typeof input.fileName !== 'string' ||
    input.fileName.trim().length === 0 ||
    input.fileName.trim().length > 255 ||
    Array.from(input.fileName).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    invalid('File name is invalid');
  }
  if (
    typeof input.fileSize !== 'number' ||
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > MAX_VIDEO_BYTES
  ) {
    invalid(`File size must be between 1 and ${MAX_VIDEO_BYTES} bytes`);
  }
  return {fileName: input.fileName.trim(), fileSize: input.fileSize};
}

function parsePromotion(value: unknown): HistoricalPromotionRequest {
  if (!value || typeof value !== 'object') invalid('Request body must be an object');
  const sourceMediaId = (value as Record<string, unknown>).sourceMediaId;
  if (typeof sourceMediaId !== 'string' || !sourceMediaId.trim()) {
    invalid('Source media id is required');
  }
  return {sourceMediaId: sourceMediaId.trim()};
}

function uploadOrigin(env: WorkerEnv['Bindings']) {
  const origin = env.STREAM_ALLOWED_ORIGIN?.trim();
  if (!origin || origin.includes('/') || origin.includes('*')) {
    throw new ServiceError(
      'AUTH_CONFIG_INVALID',
      'Stream allowed origin is invalid',
      500,
    );
  }
  return origin;
}

function deliveryHost(env: WorkerEnv['Bindings']) {
  const host = env.STREAM_DELIVERY_HOST?.trim();
  if (!host || host.includes('/') || host.includes('*')) {
    throw new ServiceError('AUTH_CONFIG_INVALID', 'Stream delivery host is invalid', 500);
  }
  return host;
}

function historicalSource(env: WorkerEnv['Bindings']) {
  const mode = streamMode(env);
  if (mode === 'disabled') {
    throw new ServiceError(
      'SERVICE_UNAVAILABLE',
      'Video processing is temporarily unavailable',
      503,
    );
  }
  if (mode === 'fake') return new FakeHistoricalVideoSource();
  if (
    !env.R2_ACCOUNT_ID?.trim() ||
    !env.R2_BUCKET_NAME?.trim() ||
    !env.R2_ACCESS_KEY_ID?.trim() ||
    !env.R2_SECRET_ACCESS_KEY?.trim()
  ) {
    throw new ServiceError(
      'AUTH_CONFIG_INVALID',
      'Historical Stream promotion is not configured',
      500,
    );
  }
  return new R2HistoricalVideoSource(
    env.R2_ACCOUNT_ID,
    env.R2_BUCKET_NAME,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
  );
}

function invalid(message: string): never {
  throw new ServiceError('VALIDATION_FAILED', message, 400);
}

function respondError(c: Context<WorkerEnv>, error: unknown) {
  const result = errorResponse(error);
  return c.json(result.response, result.status);
}
