import {Hono} from 'hono';

import type {GroupResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {requireRole} from '../middleware/user';
import {deleteGroup, updateGroup} from '../repositories/groups';
import {errorResponse} from '../services/errors';
import {parseGroupWrite} from '../services/project-input';

export const groupsRoutes = new Hono<WorkerEnv>();

groupsRoutes.put('/:groupId', requireRole('admin'), async (c) => {
  try {
    const input = parseGroupWrite(await c.req.json());
    const group = await updateGroup(c.env.DB, c.req.param('groupId'), input.name);
    const response: GroupResponse = {group};
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

groupsRoutes.delete('/:groupId', requireRole('admin'), async (c) => {
  try {
    await deleteGroup(c.env.DB, c.req.param('groupId'));
    return c.body(null, 204);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
