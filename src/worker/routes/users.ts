import {Hono} from 'hono';

import type {UserProfileResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {getUserProfile} from '../repositories/users';
import {errorResponse} from '../services/errors';

export const usersRoutes = new Hono<WorkerEnv>();

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
