import {Hono} from 'hono';

import type {WorkerEnv} from '../index';
import {
  castVote,
  deleteVote,
  getVoting,
  replaceVote,
} from '../repositories/administration';
import {parseVote} from '../services/administration-input';
import {errorResponse, ServiceError} from '../services/errors';

export const votesRoutes = new Hono<WorkerEnv>();

votesRoutes.get('/', async (c) => {
  try {
    const yearId = c.req.query('year');
    if (!yearId)
      throw new ServiceError(
        'VALIDATION_FAILED',
        'Year query parameter is required',
        400,
      );
    return c.json(await getVoting(c.env.DB, yearId, c.get('user').id));
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

votesRoutes.post('/', async (c) => {
  try {
    return c.json(
      {vote: await castVote(c.env.DB, parseVote(await c.req.json()), c.get('user').id)},
      201,
    );
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

votesRoutes.put('/:voteId', async (c) => {
  try {
    return c.json({
      vote: await replaceVote(
        c.env.DB,
        c.req.param('voteId'),
        parseVote(await c.req.json()),
        c.get('user').id,
      ),
    });
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

votesRoutes.delete('/:voteId', async (c) => {
  try {
    await deleteVote(c.env.DB, c.req.param('voteId'), c.get('user').id);
    return c.body(null, 204);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
