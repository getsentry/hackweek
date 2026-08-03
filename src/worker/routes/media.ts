import {Hono} from 'hono';

import type {MediaResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {
  attachmentHeaders,
  deleteMedia,
  downloadMedia,
  uploadMedia,
} from '../repositories/media';
import {errorResponse, ServiceError} from '../services/errors';

export const mediaRoutes = new Hono<WorkerEnv>();

mediaRoutes.post('/projects/:projectId', async (c) => {
  try {
    const form = await c.req.formData();
    const value = form.get('file');
    if (!(value instanceof File)) {
      throw new ServiceError('VALIDATION_FAILED', 'A file is required', 400);
    }
    const media = await uploadMedia(
      c.env.DB,
      c.env.ATTACHMENTS,
      c.req.param('projectId'),
      value,
      c.get('user'),
    );
    const response: MediaResponse = {media};
    return c.json(response, 201);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

mediaRoutes.get('/:mediaId/content', async (c) => {
  try {
    const {media, object} = await downloadMedia(
      c.env.DB,
      c.env.ATTACHMENTS,
      c.req.param('mediaId'),
    );
    return new Response(object.body, {headers: attachmentHeaders(media, object)});
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

mediaRoutes.delete('/:mediaId', async (c) => {
  try {
    await deleteMedia(c.env.DB, c.env.ATTACHMENTS, c.req.param('mediaId'), c.get('user'));
    return c.body(null, 204);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
