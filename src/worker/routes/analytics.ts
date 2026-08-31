import {Hono} from 'hono';

import {
  analyticsVideoExportFilename,
  formatAnalyticsVideoExportCsv,
} from '../../shared/analytics-export';
import type {WorkerEnv} from '../index';
import {requireRole} from '../middleware/user';
import {getAnalytics, getAnalyticsVideoExport} from '../repositories/administration';
import {errorResponse, ServiceError} from '../services/errors';

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

analyticsRoutes.get('/export', async (c) => {
  try {
    const yearId = c.req.query('year')?.trim();
    if (!yearId) {
      throw new ServiceError(
        'VALIDATION_FAILED',
        'year is required for the ready-video export',
        400,
      );
    }
    const rows = await getAnalyticsVideoExport(c.env.DB, yearId);
    const csv = formatAnalyticsVideoExportCsv(rows);
    const filename = analyticsVideoExportFilename(yearId);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const result = errorResponse(error);
    return c.json(result.response, result.status);
  }
});
