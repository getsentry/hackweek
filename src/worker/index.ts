import {Hono} from 'hono';

export type WorkerEnv = {
  Bindings: Env;
};

const app = new Hono<WorkerEnv>();

app.get('/api/health', (c) => c.json({ok: true}));

export default app;
