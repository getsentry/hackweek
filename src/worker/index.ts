import {Hono} from 'hono';

import type {AuthBindings, AuthVariables} from './middleware/auth';
import {authenticateRequest, protectMutationOrigin} from './middleware/auth';
import {requireRole} from './middleware/user';
import {adminRoutes} from './routes/admin';
import {authenticatedAuthRoutes, authRoutes} from './routes/auth';
import {analyticsRoutes} from './routes/analytics';
import {awardsRoutes} from './routes/awards';
import {groupsRoutes} from './routes/groups';
import {mediaRoutes} from './routes/media';
import {projectsRoutes} from './routes/projects';
import {sessionRoutes} from './routes/session';
import {streamWebhookRoutes} from './routes/stream-webhook';
import {videoJobRoutes} from './routes/video-jobs';
import {projectVideoRoutes, videosRoutes} from './routes/videos';
import {votesRoutes} from './routes/votes';
import {yearsRoutes} from './routes/years';

export interface VideoBindings {
  STREAM_MODE?: string;
  STREAM_ACCOUNT_ID?: string;
  STREAM_API_TOKEN?: string;
  STREAM_WEBHOOK_SECRET?: string;
  STREAM_ALLOWED_ORIGIN?: string;
  STREAM_DELIVERY_HOST?: string;
  VIDEO_SERVICE_TOKEN?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

export type WorkerEnv = {
  Bindings: Env & AuthBindings & VideoBindings & {ASSETS: Fetcher};
  Variables: AuthVariables;
};

const app = new Hono<WorkerEnv>();

app.get('/api/health', (c) => c.json({ok: true}));
app.route('/api/stream-webhook', streamWebhookRoutes);
app.route('/api/video-jobs', videoJobRoutes);
app.route('/api/auth', authRoutes);

app.use('/api/*', authenticateRequest<WorkerEnv>());
app.use('/api/*', protectMutationOrigin<WorkerEnv>());
app.route('/api/auth', authenticatedAuthRoutes);
app.route('/api/session', sessionRoutes);
app.route('/api/years', yearsRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/projects', projectVideoRoutes);
app.route('/api/videos', videosRoutes);
app.route('/api/groups', groupsRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/votes', votesRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/analytics', analyticsRoutes);
app.route('/api/admin/awards', awardsRoutes);
app.get('/api/admin/session', requireRole('admin'), (c) => c.json({user: c.get('user')}));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
