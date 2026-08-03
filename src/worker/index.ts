import {Hono} from 'hono';

import type {AuthBindings, AuthVariables} from './middleware/auth';
import {accessIdentity} from './middleware/auth';
import {requireRole, resolveUser} from './middleware/user';
import {sessionRoutes} from './routes/session';

export type WorkerEnv = {
  Bindings: Env & AuthBindings;
  Variables: AuthVariables;
};

const app = new Hono<WorkerEnv>();

app.get('/api/health', (c) => c.json({ok: true}));

app.use('/api/*', accessIdentity<WorkerEnv>());
app.use('/api/*', resolveUser);
app.route('/api/session', sessionRoutes);

// This primitive proves the shared admin boundary. Product administration routes added later
// must use the same server-side middleware rather than frontend state.
app.get('/api/admin/session', requireRole('admin'), (c) => c.json({user: c.get('user')}));

export default app;
