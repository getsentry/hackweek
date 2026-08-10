import {Hono} from 'hono';

import type {GroupResponse, YearResponse, YearsResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {streamMode} from '../integrations/stream';
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
    const [year, groups, awardResult] = await Promise.all([
      getYear(c.env.DB, yearId),
      listGroups(c.env.DB, yearId),
      c.env.DB.prepare(
        `SELECT a.id, a.year_id, a.project_id, p.name project_name,
          a.category_id, category.name category_name, a.name
         FROM awards a JOIN projects p ON p.id = a.project_id
         JOIN award_categories category ON category.id = a.category_id
         WHERE a.year_id = ? ORDER BY category.name COLLATE NOCASE`,
      )
        .bind(yearId)
        .all<{
          id: string;
          year_id: string;
          project_id: string;
          project_name: string;
          category_id: string;
          category_name: string;
          name: string;
        }>(),
    ]);
    const response: YearResponse = {
      year,
      groups,
      awards: awardResult.results.map((award) => ({
        id: award.id,
        yearId: award.year_id,
        projectId: award.project_id,
        projectName: award.project_name,
        categoryId: award.category_id,
        categoryName: award.category_name,
        name: award.name,
      })),
      streamMode: streamMode(c.env),
    };
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
