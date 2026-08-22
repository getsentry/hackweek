import {Hono} from 'hono';

import type {ProjectResponse, ProjectsResponse} from '../../shared/projects';
import type {WorkerEnv} from '../index';
import {
  claimProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../repositories/projects';
import {errorResponse, ServiceError} from '../services/errors';
import {parseProjectWrite} from '../services/project-input';

export const projectsRoutes = new Hono<WorkerEnv>();

projectsRoutes.get('/', async (c) => {
  try {
    const yearId = c.req.query('year');
    if (!yearId) {
      throw new ServiceError(
        'VALIDATION_FAILED',
        'Year query parameter is required',
        400,
      );
    }
    const kindQuery = c.req.query('kind');
    if (kindQuery && kindQuery !== 'project' && kindQuery !== 'idea') {
      throw new ServiceError('VALIDATION_FAILED', 'Kind query is invalid', 400);
    }
    const kind = kindQuery === 'project' || kindQuery === 'idea' ? kindQuery : undefined;
    const limit = boundedInteger(c.req.query('limit'), 24, 1, 250, 'Limit');
    const offset = boundedInteger(c.req.query('cursor'), 0, 0, 100_000, 'Cursor');
    const search = boundedSearch(c.req.query('q'));
    const hasVideoQuery = c.req.query('hasVideo');
    if (hasVideoQuery !== undefined && hasVideoQuery !== 'true') {
      throw new ServiceError('VALIDATION_FAILED', 'Has video query is invalid', 400);
    }
    const response: ProjectsResponse = await listProjects(c.env.DB, {
      yearId,
      kind,
      groupId: c.req.query('group'),
      categoryId: c.req.query('category'),
      search,
      hasVideo: hasVideoQuery === 'true',
      limit,
      offset,
    });
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

projectsRoutes.post('/', async (c) => {
  try {
    const input = parseProjectWrite(await c.req.json());
    const project = await createProject(c.env.DB, input, c.get('user'));
    const response: ProjectResponse = {project};
    return c.json(response, 201);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

projectsRoutes.get('/:projectId', async (c) => {
  try {
    const project = await getProject(c.env.DB, c.req.param('projectId'), c.get('user'));
    const response: ProjectResponse = {project};
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

projectsRoutes.put('/:projectId', async (c) => {
  try {
    const input = parseProjectWrite(await c.req.json());
    const project = await updateProject(
      c.env.DB,
      c.req.param('projectId'),
      input,
      c.get('user'),
    );
    const response: ProjectResponse = {project};
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

projectsRoutes.post('/:projectId/claim', async (c) => {
  try {
    const input = parseProjectWrite(await c.req.json());
    const project = await claimProject(
      c.env.DB,
      c.req.param('projectId'),
      input,
      c.get('user'),
    );
    const response: ProjectResponse = {project};
    return c.json(response);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

projectsRoutes.delete('/:projectId', async (c) => {
  try {
    await deleteProject(c.env.DB, c.req.param('projectId'), c.get('user'));
    return c.body(null, 204);
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});

function boundedSearch(value: string | undefined) {
  if (value === undefined) return undefined;
  if (value.length > 100) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'Search query must be at most 100 characters',
      400,
    );
  }
  return value.trim() || undefined;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      `${label} must be an integer between ${min} and ${max}`,
      400,
    );
  }
  return parsed;
}
