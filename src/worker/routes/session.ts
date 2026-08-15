import {Hono} from 'hono';

import type {ApiErrorResponse, SessionResponse, SessionViewMode} from '../../shared/api';
import {isJsonObject, type JsonInput} from '../../shared/json';
import {parseUpdateProfile, ProfileValidationError} from '../../shared/profile';
import type {AuthBindings, AuthVariables} from '../middleware/auth';
import {setSessionViewMode} from '../services/sessions';
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

sessionRoutes.post('/view-mode', async (c) => {
  try {
    const mode = parseViewMode(await c.req.json());
    const user = await setSessionViewMode(c.env.DB, c.get('sessionTokenHash'), mode);
    if (!user) {
      const response: ApiErrorResponse = {
        error: {
          code: 'AUTH_FORBIDDEN',
          message: 'Admin role is required to change view mode',
        },
      };
      return c.json(response, 403);
    }
    const response: SessionResponse = {user};
    return c.json(response);
  } catch (error) {
    if (error instanceof ViewModeValidationError || error instanceof SyntaxError) {
      const response: ApiErrorResponse = {
        error: {code: 'VALIDATION_FAILED', message: 'View mode is invalid'},
      };
      return c.json(response, 400);
    }
    throw error;
  }
});

sessionRoutes.put('/profile', async (c) => {
  try {
    const profile = parseUpdateProfile(await c.req.json());
    const updatedUser = await updateUserProfile(c.env.DB, c.get('user').id, profile);
    const currentUser = c.get('user');
    const response: SessionResponse = {
      user: {
        ...updatedUser,
        role: currentUser.role,
        actualRole: currentUser.actualRole,
      },
    };
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

function parseViewMode(value: JsonInput): SessionViewMode {
  if (!isJsonObject(value) || (value.mode !== 'admin' && value.mode !== 'member')) {
    throw new ViewModeValidationError();
  }
  return value.mode;
}

class ViewModeValidationError extends Error {}
