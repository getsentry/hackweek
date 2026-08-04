import {Hono} from 'hono';

import type {WorkerEnv} from '../index';
import {requireRole} from '../middleware/user';
import {createAward, deleteAward, updateAward} from '../repositories/administration';
import {parseAward} from '../services/administration-input';
import {errorResponse} from '../services/errors';

export const awardsRoutes = new Hono<WorkerEnv>();
awardsRoutes.use('*', requireRole('admin'));

awardsRoutes.post('/years/:yearId', async (c) => {
  try {
    return c.json(
      {
        award: await createAward(
          c.env.DB,
          c.req.param('yearId'),
          parseAward(await c.req.json()),
          c.get('user').id,
        ),
      },
      201,
    );
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

awardsRoutes.put('/:awardId', async (c) => {
  try {
    return c.json({
      award: await updateAward(
        c.env.DB,
        c.req.param('awardId'),
        parseAward(await c.req.json()),
      ),
    });
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

awardsRoutes.delete('/:awardId', async (c) => {
  try {
    await deleteAward(c.env.DB, c.req.param('awardId'));
    return c.body(null, 204);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
