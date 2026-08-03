import {Hono} from 'hono';

import type {GroupResponse, YearResponse, YearsResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {requireRole} from '../middleware/user';
import {createGroup} from '../repositories/groups';
import {
  getYear,
  listGroups,
  listProjectOptions,
  listYears,
} from '../repositories/projects';
import {errorResponse} from '../services/errors';
import {parseGroupWrite} from '../services/project-input';

export const yearsRoutes = new Hono<WorkerEnv>();

yearsRoutes.get('/', async (c) => {
  const response: YearsResponse = {years: await listYears(c.env.DB)};
  return c.json(response);
});

yearsRoutes.get('/:yearId', async (c) => {
  try {
    const yearId = c.req.param('yearId');
    const [year, groups] = await Promise.all([
      getYear(c.env.DB, yearId),
      listGroups(c.env.DB, yearId),
    ]);
    const response: YearResponse = {year, groups};
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

yearsRoutes.get('/:yearId/options', async (c) => {
  try {
    return c.json(await listProjectOptions(c.env.DB, c.req.param('yearId')));
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

yearsRoutes.post('/:yearId/groups', requireRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const input = parseGroupWrite(await c.req.json());
    const group = await createGroup(c.env.DB, c.req.param('yearId'), input.name, user.id);
    const response: GroupResponse = {group};
    return c.json(response, 201);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
