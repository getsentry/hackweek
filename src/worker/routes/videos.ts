import {Hono, type Context} from 'hono';

import type {
  CompleteVideoUploadRequest,
  DirectUploadRequest,
  DirectUploadResponse,
  ProjectVideoResponse,
} from '../../shared/videos';
import {streamMode} from '../integrations/stream';
import type {WorkerEnv} from '../index';
import {errorResponse, ServiceError} from '../services/errors';
import {
  abortVideoUpload,
  completeVideoUpload,
  createMultipartVideoUpload,
  getProjectVideo,
  getVideoUpload,
  MAX_VIDEO_BYTES,
  retireProjectVideo,
  retryProjectVideo,
  uploadVideoPart,
} from '../services/videos';

export const videosRoutes = new Hono<WorkerEnv>();
export const projectVideoRoutes = new Hono<WorkerEnv>();

projectVideoRoutes.get('/:projectId/video', async (c) => {
  try {
    const response: ProjectVideoResponse = {
      video: await getProjectVideo(c.env.DB, c.req.param('projectId')),
      streamMode: streamMode(c.env),
    };
    return c.json(response);
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.post('/:projectId/video/upload', async (c) => {
  try {
    const input = parseUpload(await c.req.json());
    const response: DirectUploadResponse = await createMultipartVideoUpload(
      c.env.DB,
      c.env.VIDEOS,
      c.req.param('projectId'),
      c.get('user'),
      input,
    );
    return c.json(response, 201, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.get('/:projectId/video/upload/:uploadId', async (c) => {
  try {
    const response: DirectUploadResponse = await getVideoUpload(
      c.env.DB,
      c.env.VIDEOS,
      c.req.param('projectId'),
      c.req.param('uploadId'),
      c.get('user'),
    );
    return c.json(response, 200, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.put(
  '/:projectId/video/upload/:uploadId/parts/:partNumber',
  async (c) => {
    try {
      const partNumber = parsePartNumber(c.req.param('partNumber'));
      const contentLength = parseContentLength(c.req.header('Content-Length'));
      const body = c.req.raw.body;
      if (!body) invalid('Video part body is required');
      const part = await uploadVideoPart(
        c.env.DB,
        c.env.VIDEOS,
        c.req.param('projectId'),
        c.req.param('uploadId'),
        partNumber,
        contentLength,
        body,
        c.get('user'),
      );
      return c.json({part}, 200, {'Cache-Control': 'private, no-store'});
    } catch (error) {
      return respondError(c, error);
    }
  },
);

projectVideoRoutes.post('/:projectId/video/upload/:uploadId/complete', async (c) => {
  try {
    const input = parseCompletion(await c.req.json());
    const video = await completeVideoUpload(
      c.env.DB,
      c.env.VIDEOS,
      String(c.env.VIDEO_PROCESSING_AUTOSTART) === 'false'
        ? null
        : c.env.VIDEO_PROCESSING_WORKFLOW,
      c.req.param('projectId'),
      c.req.param('uploadId'),
      input.parts,
      c.get('user'),
    );
    return c.json({video}, 200, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.post('/:projectId/video/retry', async (c) => {
  try {
    const video = await retryProjectVideo(
      c.env.DB,
      String(c.env.VIDEO_PROCESSING_AUTOSTART) === 'false'
        ? null
        : c.env.VIDEO_PROCESSING_WORKFLOW,
      c.req.param('projectId'),
      c.get('user'),
    );
    return c.json({video}, 202, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.post('/:projectId/video/promote', (c) =>
  c.json(
    {
      error: {
        code: 'NOT_FOUND' as const,
        message: 'Attachment promotion is not supported',
      },
    },
    404,
  ),
);

projectVideoRoutes.delete('/:projectId/video/upload/:uploadId', async (c) => {
  try {
    await abortVideoUpload(
      c.env.DB,
      c.env.VIDEOS,
      c.req.param('projectId'),
      c.req.param('uploadId'),
      c.get('user'),
    );
    return c.body(null, 204);
  } catch (error) {
    return respondError(c, error);
  }
});

projectVideoRoutes.delete('/:projectId/video', async (c) => {
  try {
    const confirmed = parseRetirement(await c.req.json());
    await retireProjectVideo(
      c.env.DB,
      c.req.param('projectId'),
      c.get('user'),
      confirmed,
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
  if (
    input.contentType !== null &&
    (typeof input.contentType !== 'string' ||
      !/^video\/[a-zA-Z0-9!#$&^_.+-]{1,100}$/.test(input.contentType))
  ) {
    invalid('Content type must be a valid video media type');
  }
  return {
    fileName: input.fileName.trim(),
    fileSize: input.fileSize,
    contentType: input.contentType,
  };
}

function parseCompletion(value: unknown): CompleteVideoUploadRequest {
  if (!value || typeof value !== 'object') invalid('Request body must be an object');
  const parts = (value as Record<string, unknown>).parts;
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 10_000) {
    invalid('Completed parts are required');
  }
  const parsed = parts.map((part) => {
    if (!part || typeof part !== 'object') invalid('Completed part is invalid');
    const record = part as Record<string, unknown>;
    if (
      !Number.isInteger(record.partNumber) ||
      (record.partNumber as number) < 1 ||
      (record.partNumber as number) > 10_000 ||
      typeof record.etag !== 'string' ||
      !record.etag ||
      record.etag.length > 256
    ) {
      invalid('Completed part is invalid');
    }
    return {partNumber: record.partNumber as number, etag: record.etag};
  });
  parsed.sort((left, right) => left.partNumber - right.partNumber);
  if (new Set(parsed.map((part) => part.partNumber)).size !== parsed.length) {
    invalid('Completed part numbers must be unique');
  }
  return {parts: parsed};
}

function parseRetirement(value: unknown) {
  if (!value || typeof value !== 'object') invalid('Request body must be an object');
  return (value as Record<string, unknown>).confirmed === true;
}

function parsePartNumber(value: string) {
  if (!/^\d+$/.test(value)) invalid('Part number is invalid');
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10_000) {
    invalid('Part number is invalid');
  }
  return number;
}

function parseContentLength(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) invalid('Content-Length is required');
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length <= 0) invalid('Content-Length is invalid');
  return length;
}

function invalid(message: string): never {
  throw new ServiceError('VALIDATION_FAILED', message, 400);
}

function respondError(c: Context<WorkerEnv>, error: unknown) {
  const result = errorResponse(error);
  return c.json(result.response, result.status);
}
