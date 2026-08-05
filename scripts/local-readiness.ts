#!/usr/bin/env node
import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import {mkdtemp, rename, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = process.cwd();
const fixture = path.join(root, 'test/fixtures/firebase');
const state = await mkdtemp(path.join(tmpdir(), 'hackweek-readiness-'));
const port = Number(process.env.READINESS_PORT ?? 5199);
const origin = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;
const serverLog: string[] = [];
const rootDevVars = path.join(root, '.dev.vars');
const savedDevVars = path.join(state, '.dev.vars.saved');
const hadDevVars = await exists(rootDevVars);

try {
  run('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'hackweek-db',
    '--local',
    '--persist-to',
    state,
  ]);
  run('npm', [
    'run',
    'migrate:local',
    '--',
    '--database',
    path.join(fixture, 'database.json'),
    '--storage-manifest',
    path.join(fixture, 'storage-manifest.json'),
    '--storage-root',
    path.join(fixture, 'storage'),
    '--persist-to',
    state,
  ]);
  run('npm', [
    'run',
    'migrate:reconcile',
    '--',
    '--source',
    path.join(fixture, 'database.json'),
    '--storage-manifest',
    path.join(fixture, 'storage-manifest.json'),
    '--storage-root',
    path.join(fixture, 'storage'),
    '--target',
    'local',
    '--persist-to',
    state,
  ]);

  const isolatedConfig = path.join(state, 'wrangler.readiness.json');
  await writeFile(
    path.join(state, '.dev.vars'),
    `AUTH_MODE="local"\nAPP_ORIGIN="${origin}"\nLOCAL_AUTH_SUBJECT="local-browser-user"\nLOCAL_AUTH_EMAIL="developer@sentry.io"\nLOCAL_AUTH_NAME="Local Developer"\nALLOWED_EMAIL_DOMAIN="sentry.io"\nSTREAM_MODE="fake"\nSTREAM_ALLOWED_ORIGIN="localhost"\nSTREAM_DELIVERY_HOST="customer-fake.cloudflarestream.com"\nSTREAM_WEBHOOK_SECRET="local-readiness-webhook-secret"\nVIDEO_SERVICE_TOKEN="local-readiness-video-service-token"\n`,
    {mode: 0o600},
  );
  await writeFile(
    isolatedConfig,
    JSON.stringify({
      name: 'hackweek-readiness',
      main: path.join(root, 'src/worker/index.ts'),
      compatibility_date: '2026-08-03',
      assets: {
        directory: path.join(root, 'public'),
        not_found_handling: 'single-page-application',
        run_worker_first: ['/api/*'],
      },
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'hackweek-db',
          database_id: 'local',
          migrations_dir: path.join(root, 'migrations'),
        },
      ],
      r2_buckets: [{binding: 'ATTACHMENTS', bucket_name: 'hackweek-attachments-local'}],
      vars: {
        AUTH_MODE: 'local',
        APP_ORIGIN: origin,
        LOCAL_AUTH_SUBJECT: 'local-browser-user',
        LOCAL_AUTH_EMAIL: 'developer@sentry.io',
        LOCAL_AUTH_NAME: 'Local Developer',
        ALLOWED_EMAIL_DOMAIN: 'sentry.io',
        STREAM_MODE: 'fake',
        STREAM_ALLOWED_ORIGIN: 'localhost',
        STREAM_DELIVERY_HOST: 'customer-fake.cloudflarestream.com',
        STREAM_WEBHOOK_SECRET: 'local-readiness-webhook-secret',
        VIDEO_SERVICE_TOKEN: 'local-readiness-video-service-token',
      },
    }),
    {mode: 0o600},
  );

  if (hadDevVars) await rename(rootDevVars, savedDevVars);
  await writeFile(
    rootDevVars,
    `AUTH_MODE="local"\nAPP_ORIGIN="${origin}"\nLOCAL_AUTH_SUBJECT="local-browser-user"\nLOCAL_AUTH_EMAIL="developer@sentry.io"\nLOCAL_AUTH_NAME="Local Developer"\nALLOWED_EMAIL_DOMAIN="sentry.io"\nSTREAM_MODE="fake"\nSTREAM_ALLOWED_ORIGIN="localhost"\nSTREAM_DELIVERY_HOST="customer-fake.cloudflarestream.com"\nSTREAM_WEBHOOK_SECRET="local-readiness-webhook-secret"\nVIDEO_SERVICE_TOKEN="local-readiness-video-service-token"\n`,
    {mode: 0o600},
  );

  server = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite-plus/bin/vp'),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: root,
      detached: true,
      env: readinessEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout?.on('data', (chunk) => serverLog.push(String(chunk)));
  server.stderr?.on('data', (chunk) => serverLog.push(String(chunk)));
  await waitForServer(serverLog);

  const session = await get('/api/session');
  assert(session.user.role === 'member', 'seeded local identity starts as a member');
  assert(
    session.user.email === 'developer@sentry.io',
    'seeded local identity is explicit',
  );

  const years = await get('/api/years');
  assert(
    years.years.some((year: {id: string}) => year.id === '2024'),
    'archive is seeded',
  );
  const projects = await get('/api/projects?year=2024&limit=50');
  assert(
    projects.projects.some(
      (project: {name: string}) => project.name === 'Historical Telescope',
    ),
    'migrated project is browseable',
  );
  assert(
    projects.projects.some((project: {name: string}) => project.name === 'Idea Compass'),
    'project-free idea remains browseable',
  );
  const project = await get('/api/projects/project-history');
  assert(project.project.members.length === 2, 'migrated team is preserved');
  assert(
    project.project.media[0]?.originalName === 'poster.txt',
    'migrated media is linked',
  );
  const media = await request(`/api/media/${project.project.media[0].id}/content`);
  assert(media.status === 200, 'private R2 attachment downloads through the Worker');
  assert((await media.text()).includes('Synthetic'), 'seeded R2 bytes reconcile');

  const voting = await get('/api/votes?year=2024');
  assert(voting.year.votingEnabled === true, 'seeded voting state is enabled');
  assert(voting.categories[0]?.name === 'Impact', 'seeded ballot is available');
  const memberAdmin = await request('/api/admin/years/2024');
  assert(memberAdmin.status === 403, 'member cannot use admin APIs');

  sql(
    "UPDATE users SET is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE source_uid = 'local-browser-user' AND email = 'developer@sentry.io'",
  );
  const admin = await get('/api/session');
  assert(admin.user.role === 'admin', 'D1 promotion enables the admin role');
  const adminYear = await get('/api/admin/years/2024');
  assert(adminYear.awards[0]?.name === 'Impact winner', 'awards/admin data is available');
  const analytics = await get('/api/admin/analytics?year=2024');
  assert(
    analytics.years[0]?.voteCount === 1,
    'admin analytics reconcile the fixture vote',
  );

  await send('PUT', '/api/admin/years/2024/screening-order', {
    projectIds: ['project-history'],
  });
  const fakeUpload = await send('POST', '/api/projects/project-history/video/upload', {
    fileName: 'local-demo.mp4',
    fileSize: 300_000_000,
  });
  assert(fakeUpload.upload.protocol === 'tus', 'fake Stream exposes the tus contract');
  assert(
    fakeUpload.upload.url.startsWith('https://upload.videodelivery.net/fake/'),
    'fake upload stays visibly non-real',
  );
  const emptyPlaylist = await get('/api/videos/playlist?year=2024');
  assert(emptyPlaylist.videos.length === 0, 'unready uploads stay out of screening');

  sql(
    `UPDATE project_videos SET status = 'ready', duration_seconds = 42, loudness_lufs = -18, gain_db = 2 WHERE id = '${escapeSql(fakeUpload.video.id)}'`,
  );
  const playlist = await get('/api/videos/playlist?year=2024');
  assert(playlist.videos.length === 1, 'ready videos follow the saved screening order');
  const playback = await get(`/api/videos/${fakeUpload.video.id}/playback`);
  assert(
    playback.mode === 'fake' && playback.manifestUrl === null,
    'local playback refuses to impersonate real Stream HLS',
  );

  console.log('Local cutover readiness: 20 checks passed');
} finally {
  await stopServer();
  await rm(rootDevVars, {force: true});
  if (hadDevVars) await rename(savedDevVars, rootDevVars);
  await rm(state, {recursive: true, force: true});
}

function readinessEnv() {
  return {
    ...process.env,
    CLOUDFLARE_VITE_DEV_VARS_PATH: '/dev/null',
    HACKWEEK_LOCAL_STATE_PATH: state,
    HACKWEEK_WRANGLER_CONFIG: path.join(state, 'wrangler.readiness.json'),
    AUTH_MODE: 'local',
    APP_ORIGIN: origin,
    LOCAL_AUTH_SUBJECT: 'local-browser-user',
    LOCAL_AUTH_EMAIL: 'developer@sentry.io',
    LOCAL_AUTH_NAME: 'Local Developer',
    ALLOWED_EMAIL_DOMAIN: 'sentry.io',
    STREAM_MODE: 'fake',
    STREAM_ALLOWED_ORIGIN: 'localhost',
    STREAM_DELIVERY_HOST: 'customer-fake.cloudflarestream.com',
    STREAM_WEBHOOK_SECRET: 'local-readiness-webhook-secret',
    VIDEO_SERVICE_TOKEN: 'local-readiness-video-service-token',
  };
}

function run(command: string, args: string[]) {
  execFileSync(command, args, {cwd: root, env: readinessEnv(), stdio: 'inherit'});
}

function sql(command: string) {
  run('npx', [
    'wrangler',
    'd1',
    'execute',
    'hackweek-db',
    '--local',
    '--persist-to',
    state,
    '--command',
    command,
  ]);
}

async function stopServer() {
  if (!server?.pid || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    return;
  }
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => server!.once('exit', () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (!exited) {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // The process group exited between checks.
    }
  }
}

async function waitForServer(log: string[]) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server?.exitCode !== null) {
      throw new Error(`Local server exited early:\n${log.join('')}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (server?.exitCode === null) return;
      }
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for local server:\n${log.join('')}`);
}

async function get(pathname: string) {
  const response = await request(pathname);
  if (!response.ok) {
    throw new Error(
      `${pathname} returned ${response.status}: ${await response.text()}\n${serverLog.join('')}`,
    );
  }
  return response.json() as Promise<any>;
}

async function send(method: 'POST' | 'PUT', pathname: string, body: unknown) {
  const response = await request(pathname, {
    method,
    headers: {'Content-Type': 'application/json', Origin: origin},
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return response.json() as Promise<any>;
}

function request(pathname: string, init?: RequestInit) {
  return fetch(`${origin}${pathname}`, init);
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Readiness check failed: ${message}`);
  console.log(`✓ ${message}`);
}

function escapeSql(value: string) {
  return value.replaceAll("'", "''");
}

function exists(filename: string) {
  return stat(filename).then(
    () => true,
    () => false,
  );
}
