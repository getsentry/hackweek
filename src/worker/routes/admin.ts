import {Hono} from 'hono';
import type {Context} from 'hono';

import type {WorkerEnv} from '../index';
import {requireRole} from '../middleware/user';
import {
  createCategory,
  createYear,
  deleteCategory,
  getAdminYear,
  replaceNominations,
  replaceScreeningOrder,
  updateCategory,
  updateYear,
} from '../repositories/administration';
import {
  parseNamed,
  parseNominations,
  parseScreeningOrder,
  parseYear,
} from '../services/administration-input';
import {errorResponse} from '../services/errors';

export const adminRoutes = new Hono<WorkerEnv>();
adminRoutes.use('*', requireRole('admin'));

adminRoutes.post('/years/:yearId', async (c) =>
  run(c, async () =>
    c.json({year: await createYear(c.env.DB, c.req.param('yearId'))}, 201),
  ),
);
adminRoutes.put('/years/:yearId', async (c) =>
  run(c, async () =>
    c.json({
      year: await updateYear(
        c.env.DB,
        c.req.param('yearId'),
        parseYear(await c.req.json()),
      ),
    }),
  ),
);
adminRoutes.get('/years/:yearId', async (c) =>
  run(c, async () => c.json(await getAdminYear(c.env.DB, c.req.param('yearId')))),
);

adminRoutes.post('/years/:yearId/categories', async (c) =>
  run(c, async () =>
    c.json(
      {
        category: await createCategory(
          c.env.DB,
          c.req.param('yearId'),
          parseNamed(await c.req.json()).name,
          c.get('user').id,
        ),
      },
      201,
    ),
  ),
);
adminRoutes.put('/categories/:categoryId', async (c) =>
  run(c, async () =>
    c.json({
      category: await updateCategory(
        c.env.DB,
        c.req.param('categoryId'),
        parseNamed(await c.req.json()).name,
      ),
    }),
  ),
);
adminRoutes.delete('/categories/:categoryId', async (c) =>
  run(c, async () => {
    await deleteCategory(c.env.DB, c.req.param('categoryId'));
    return c.body(null, 204);
  }),
);

adminRoutes.put('/projects/:projectId/nominations', async (c) =>
  run(c, async () =>
    c.json({
      nominations: await replaceNominations(
        c.env.DB,
        c.req.param('projectId'),
        parseNominations(await c.req.json()).categoryIds,
      ),
    }),
  ),
);

adminRoutes.put('/years/:yearId/screening-order', async (c) =>
  run(c, async () =>
    c.json({
      screeningOrder: await replaceScreeningOrder(
        c.env.DB,
        c.req.param('yearId'),
        parseScreeningOrder(await c.req.json()).projectIds,
      ),
    }),
  ),
);

async function run(c: Context<WorkerEnv>, handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
}
