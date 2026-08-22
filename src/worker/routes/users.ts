import {Hono} from 'hono';

import type {UserProfileResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {getUserAvatar, getUserProfile} from '../repositories/users';
import {errorResponse} from '../services/errors';
import {safeAvatarContentType} from '../services/users';

export const usersRoutes = new Hono<WorkerEnv>();

usersRoutes.get('/:userId/avatar', async (c) => {
  try {
    const object = await getUserAvatar(
      c.env.DB,
      c.env.ATTACHMENTS,
      c.req.param('userId'),
    );
    const headers = new Headers();
    const contentType = safeAvatarContentType(object.contentType);
    if (!contentType) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', 'attachment');
    } else {
      headers.set('Content-Type', contentType!);
      headers.set('Content-Disposition', 'inline');
    }
    headers.set('Content-Length', String(object.size));
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    return new Response(object.body, {headers});
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

usersRoutes.get('/:userId', async (c) => {
  try {
    const response: UserProfileResponse = await getUserProfile(
      c.env.DB,
      c.req.param('userId'),
    );
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
