import {createMiddleware} from 'hono/factory';

import type {ApiErrorResponse, UserRole} from '../../shared/api';
import type {AuthBindings, AuthVariables} from './auth';

interface UserEnv {
  Bindings: AuthBindings & {DB: D1Database};
  Variables: AuthVariables;
}

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
