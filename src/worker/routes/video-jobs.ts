import {Hono, type Context} from 'hono';

import type {
  ArchiveQueueResponse,
  MeasurementQueueResponse,
  MeasurementResultRequest,
} from '../../shared/videos';
import {streamGateway} from '../integrations/stream';
import type {WorkerEnv} from '../index';
import {requireVideoService} from '../middleware/service-auth';
import {errorResponse, ServiceError} from '../services/errors';
import {
  listArchiveQueue,
  listMeasurementQueue,
  markMeasurementFailure,
  recordArchiveResult,
  recordMeasurement,
} from '../services/videos';

export const videoJobRoutes = new Hono<WorkerEnv>();
videoJobRoutes.use('*', requireVideoService);

videoJobRoutes.get('/measurements', async (c) => {
  try {
    const response: MeasurementQueueResponse = {
      videos: await listMeasurementQueue(
        c.env.DB,
        streamGateway(c.env),
        deliveryHost(c.env),
      ),
    };
    return c.json(response, 200, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

videoJobRoutes.post('/measurements/:videoId', async (c) => {
  try {
    const input = parseMeasurement(await c.req.json());
    return c.json({
      video: await recordMeasurement(c.env.DB, c.req.param('videoId'), input),
    });
  } catch (error) {
    return respondError(c, error);
  }
});

videoJobRoutes.post('/measurements/:videoId/failure', async (c) => {
  try {
    const message = parseFailure(await c.req.json());
    await markMeasurementFailure(c.env.DB, c.req.param('videoId'), message);
    return c.body(null, 204);
  } catch (error) {
    return respondError(c, error);
  }
});

videoJobRoutes.get('/archives', async (c) => {
  try {
    const response: ArchiveQueueResponse = {
      videos: await listArchiveQueue(c.env.DB, streamGateway(c.env), deliveryHost(c.env)),
    };
    return c.json(response, 200, {'Cache-Control': 'private, no-store'});
  } catch (error) {
    return respondError(c, error);
  }
});

videoJobRoutes.post('/archives/:videoId', async (c) => {
  try {
    const input = parseArchive(await c.req.json());
    return c.json({
      video: await recordArchiveResult(
        c.env.DB,
        c.req.param('videoId'),
        input.status,
        input.error,
      ),
    });
  } catch (error) {
    return respondError(c, error);
  }
});

function parseMeasurement(value: unknown): MeasurementResultRequest {
  if (!value || typeof value !== 'object') invalid('Request body must be an object');
  const input = value as Record<string, unknown>;
  if (
    typeof input.loudnessLufs !== 'number' ||
    !Number.isFinite(input.loudnessLufs) ||
    input.loudnessLufs < -100 ||
    input.loudnessLufs > 20
  ) {
    invalid('Integrated loudness must be a finite LUFS value');
  }
  if (
    typeof input.durationSeconds !== 'number' ||
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0 ||
    input.durationSeconds > 24 * 60 * 60
  ) {
    invalid('Duration must be a positive finite number');
  }
  return {
    loudnessLufs: input.loudnessLufs,
    durationSeconds: input.durationSeconds,
  };
}

function parseFailure(value: unknown) {
  const message =
    value && typeof value === 'object' ? (value as Record<string, unknown>).error : null;
  if (typeof message !== 'string' || !message.trim())
    invalid('Failure error is required');
  return message.trim().slice(0, 500);
}

function parseArchive(value: unknown) {
  if (!value || typeof value !== 'object') invalid('Request body must be an object');
  const input = value as Record<string, unknown>;
  if (input.status !== 'archived' && input.status !== 'failed') {
    invalid('Archive status must be archived or failed');
  }
  if (
    input.status === 'failed' &&
    (typeof input.error !== 'string' || !input.error.trim())
  ) {
    invalid('Archive failure requires an error');
  }
  return {
    status: input.status,
    error: typeof input.error === 'string' ? input.error.trim() : null,
  } as const;
}

function deliveryHost(env: WorkerEnv['Bindings']) {
  const host = env.STREAM_DELIVERY_HOST?.trim();
  if (!host || host.includes('/') || host.includes('*')) {
    throw new ServiceError('AUTH_CONFIG_INVALID', 'Stream delivery host is invalid', 500);
  }
  return host;
}

function invalid(message: string): never {
  throw new ServiceError('VALIDATION_FAILED', message, 400);
}

function respondError(c: Context<WorkerEnv>, error: unknown) {
  const result = errorResponse(error);
  return c.json(result.response, result.status);
}
