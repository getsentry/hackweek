import {Hono} from 'hono';

import type {AuthBindings, AuthVariables} from './middleware/auth';
import {accessIdentity} from './middleware/auth';
import {requireRole, resolveUser} from './middleware/user';
import {adminRoutes} from './routes/admin';
import {analyticsRoutes} from './routes/analytics';
import {awardsRoutes} from './routes/awards';
import {groupsRoutes} from './routes/groups';
import {mediaRoutes} from './routes/media';
import {projectsRoutes} from './routes/projects';
import {sessionRoutes} from './routes/session';
import {votesRoutes} from './routes/votes';
import {yearsRoutes} from './routes/years';

export type WorkerEnv = {
  Bindings: Env & AuthBindings;
  Variables: AuthVariables;
};

const app = new Hono<WorkerEnv>();

app.get('/api/health', (c) => c.json({ok: true}));

app.use('/api/*', accessIdentity<WorkerEnv>());
app.use('/api/*', resolveUser);
app.route('/api/session', sessionRoutes);
app.route('/api/years', yearsRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/groups', groupsRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/votes', votesRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/analytics', analyticsRoutes);
app.route('/api/admin/awards', awardsRoutes);
app.get('/api/admin/session', requireRole('admin'), (c) => c.json({user: c.get('user')}));

export default app;
