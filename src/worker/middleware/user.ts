import {createMiddleware} from 'hono/factory';

import type {ApiErrorResponse, UserRole} from '../../shared/api';
import type {AuthBindings, AuthVariables} from './auth';
import {synchronizeUser, UserIdentityConflictError} from '../services/users';

interface UserEnv {
  Bindings: AuthBindings & {DB: D1Database};
  Variables: AuthVariables;
}

export const resolveUser = createMiddleware<UserEnv>(async (c, next) => {
  try {
    const user = await synchronizeUser(c.env.DB, c.get('identity'));
    c.set('user', user);
    await next();
  } catch (error) {
    if (error instanceof UserIdentityConflictError) {
      const response: ApiErrorResponse = {
        error: {
          code: 'AUTH_FORBIDDEN',
          message: 'Access identity conflicts with this profile',
        },
      };
      return c.json(response, 403);
    }
    throw error;
  }
});

export function requireRole(role: UserRole) {
  return createMiddleware<UserEnv>(async (c, next) => {
    if (c.get('user').role !== role) {
      const response: ApiErrorResponse = {
        error: {code: 'AUTH_FORBIDDEN', message: `${role} role is required`},
      };
      return c.json(response, 403);
    }
    await next();
  });
}
