import {Hono} from 'hono';

import type {ApiErrorResponse, SessionResponse} from '../../shared/api';
import {parseUpdateProfile, ProfileValidationError} from '../../shared/profile';
import type {AuthBindings, AuthVariables} from '../middleware/auth';
import {updateUserProfile} from '../services/users';

interface SessionEnv {
  Bindings: AuthBindings & {DB: D1Database};
  Variables: AuthVariables;
}

export const sessionRoutes = new Hono<SessionEnv>();

sessionRoutes.get('/', (c) => {
  const response: SessionResponse = {user: c.get('user')};
  return c.json(response);
});

sessionRoutes.put('/profile', async (c) => {
  try {
    const profile = parseUpdateProfile(await c.req.json());
    const user = await updateUserProfile(c.env.DB, c.get('user').id, profile);
    const response: SessionResponse = {user};
    return c.json(response);
  } catch (error) {
    if (error instanceof ProfileValidationError || error instanceof SyntaxError) {
      const response: ApiErrorResponse = {
        error: {code: 'VALIDATION_FAILED', message: error.message},
      };
      return c.json(response, 400);
    }
    throw error;
  }
});
