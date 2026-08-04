import {Hono} from 'hono';

import type {WorkerEnv} from '../index';
import {requireRole} from '../middleware/user';
import {getAnalytics} from '../repositories/administration';
import {errorResponse} from '../services/errors';

export const analyticsRoutes = new Hono<WorkerEnv>();
analyticsRoutes.use('*', requireRole('admin'));

analyticsRoutes.get('/', async (c) => {
  try {
    return c.json(await getAnalytics(c.env.DB, c.req.query('year')));
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
