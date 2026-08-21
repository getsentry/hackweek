import {ContainerProxy} from '@cloudflare/containers';
import {Hono} from 'hono';

import type {VideoProcessorContainer} from './containers/video-processor';
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
import {projectVideoRoutes, videosRoutes} from './routes/videos';
import {usersRoutes} from './routes/users';
import {votesRoutes} from './routes/votes';
import {yearsRoutes} from './routes/years';
import type {VideoProcessingParams} from './video-processing';

export {ContainerProxy};
export {VideoProcessorContainer} from './containers/video-processor';
export {VideoProcessingWorkflow} from './workflows/video-processing';

export interface VideoBindings {
  VIDEOS: R2Bucket;
  VIDEO_PROCESSING_WORKFLOW: Workflow<VideoProcessingParams>;
  VIDEO_PROCESSOR: DurableObjectNamespace<VideoProcessorContainer>;
  VIDEO_PROCESSOR_CONCURRENCY: string;
  VIDEO_PROCESSING_AUTOSTART: string;
}

export type WorkerEnv = {
  Bindings: Env & AuthBindings & VideoBindings & {ASSETS: Fetcher};
  Variables: AuthVariables;
};

const app = new Hono<WorkerEnv>();

app.get('/api/health', (c) => c.json({ok: true}));
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
app.route('/api/users', usersRoutes);
app.route('/api/votes', votesRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/analytics', analyticsRoutes);
app.route('/api/admin/awards', awardsRoutes);
app.get('/api/admin/session', requireRole('admin'), (c) => c.json({user: c.get('user')}));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
