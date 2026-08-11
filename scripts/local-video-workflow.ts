#!/usr/bin/env node
import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = process.cwd();
const state = await mkdtemp(path.join(tmpdir(), 'hackweek-workflow-smoke-'));
const port = Number(process.env.VIDEO_WORKFLOW_PORT ?? 5201);
const origin = `http://127.0.0.1:${port}`;
const config = path.join(state, 'wrangler.video-workflow.json');
const source = path.join(state, 'workflow-source.mp4');
const derivative = path.join(state, 'workflow-derivative.mp4');
const token = createHash('sha256').update('local-video-workflow').digest('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const rootDevVars = path.join(root, '.dev.vars');
const savedDevVars = path.join(state, '.dev.vars.saved');
const hadDevVars = await exists(rootDevVars);
let server: ChildProcess | undefined;
const logs: string[] = [];

try {
  await writeFile(config, JSON.stringify(localConfig()), {mode: 0o600});
  const devVars = `APP_ORIGIN="${origin}"\nGOOGLE_CLIENT_ID="local.apps.googleusercontent.com"\nGOOGLE_CLIENT_SECRET="local-secret"\nGOOGLE_REDIRECT_URI="${origin}/api/auth/callback"\nALLOWED_EMAIL_DOMAIN="sentry.io"\nSTREAM_MODE="fake"\nVIDEO_PROCESSOR_CONCURRENCY="1"\nVIDEO_PROCESSING_AUTOSTART="true"\n`;
  await writeFile(path.join(state, '.dev.vars'), devVars, {mode: 0o600});
  if (hadDevVars) await rename(rootDevVars, savedDevVars);
  await writeFile(rootDevVars, devVars, {mode: 0o600});

  run('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'hackweek-db',
    '--local',
    '--persist-to',
    state,
    '--config',
    config,
  ]);
  const now = Math.floor(Date.now() / 1000);
  sql(`
    INSERT INTO users
      (id, source_uid, google_subject, email, display_name, is_admin)
    VALUES
      ('workflow-user', 'workflow-user', 'workflow-google-user',
       'workflow@sentry.io', 'Workflow User', 1);
    INSERT INTO user_sessions
      (token_hash, user_id, expires_at, created_at, last_used_at)
    VALUES ('${tokenHash}', 'workflow-user', ${now + 3600}, ${now}, ${now});
    INSERT INTO years (id) VALUES ('9999');
    INSERT INTO groups (id, source_id, year_id, name, creator_id)
    VALUES ('workflow-group', 'workflow-group', '9999', 'Workflow Group', 'workflow-user');
    INSERT INTO projects
      (id, source_id, year_id, creator_id, group_id, name, summary, kind)
    VALUES
      ('workflow-project', 'workflow-project', '9999', 'workflow-user',
       'workflow-group', 'Workflow Project', 'Local real Workflow smoke', 'project');
  `);
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '2',
    '-af',
    'volume=0.05',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    '-shortest',
    source,
  ]);

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
      env: localEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout?.on('data', (chunk) => logs.push(String(chunk)));
  server.stderr?.on('data', (chunk) => logs.push(String(chunk)));
  await waitForServer();

  const bytes = await readFile(source);
  const created = await api('/api/projects/workflow-project/video/upload', {
    method: 'POST',
    body: JSON.stringify({
      fileName: 'workflow-source.mp4',
      fileSize: bytes.byteLength,
      contentType: 'video/mp4',
    }),
  });
  assert(
    created.response.status === 201,
    'multipart upload is created through the Worker',
  );
  const uploadId = created.body.upload.uploadId as string;
  const partResponse = await fetch(
    `${origin}/api/projects/workflow-project/video/upload/${uploadId}/parts/1`,
    {
      method: 'PUT',
      headers: authenticatedHeaders({
        Origin: origin,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
      }),
      body: bytes,
    },
  );
  const part = (await partResponse.json()) as {part: {partNumber: number; etag: string}};
  assert(partResponse.status === 200, 'real source bytes stream into local R2');
  const completed = await api(
    `/api/projects/workflow-project/video/upload/${uploadId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({parts: [part.part]}),
    },
  );
  assert(completed.response.status === 200, 'multipart completion starts processing');
  const videoId = completed.body.video.id as string;
  assert(
    completed.body.video.status === 'queued',
    'completed upload is initially queued',
  );
  const duplicateCompletion = await api(
    `/api/projects/workflow-project/video/upload/${uploadId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({parts: [part.part]}),
    },
  );
  assert(
    duplicateCompletion.body.video.id === videoId,
    'duplicate completion reuses the deterministic Workflow attempt',
  );

  const ready = await waitForReady();
  assert(ready.status === 'ready', 'real local Workflow conditionally marks video ready');
  assert(
    Math.abs(ready.loudnessLufs + 16) <= 0.7,
    'Workflow records normalized loudness',
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
  const workflowEvidence = output('npx', [
    'wrangler',
    'workflows',
    'instances',
    'describe',
    'hackweek-video-processing-local-smoke',
    `video-${videoId}-attempt-1`,
    '--local',
    '--port',
    String(port),
    '--config',
    config,
  ]);
  assert(
    workflowEvidence.includes('run pinned ffmpeg processor'),
    'local Workflow records FFmpeg step',
  );
  assert(
    workflowEvidence.toLowerCase().includes('complete'),
    'local Workflow instance completes',
  );

  await stopServer();
  const row = query<{original_r2_key: string; processed_r2_key: string}>(
    `SELECT original_r2_key, processed_r2_key FROM project_videos WHERE id = '${videoId}'`,
  );
  assert(
    row.original_r2_key !== row.processed_r2_key,
    'original and derivative R2 keys differ',
  );
  run('npx', [
    'wrangler',
    'r2',
    'object',
    'get',
    `hackweek-videos-local-smoke/${row.processed_r2_key}`,
    '--file',
    derivative,
    '--local',
    '--persist-to',
    state,
    '--config',
    config,
  ]);
  const probe = JSON.parse(
    output('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,pix_fmt',
      '-of',
      'json',
      derivative,
    ]),
  ) as {
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
    }>;
    format: {duration: string};
  };
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  assert(
    video?.codec_name === 'h264' && video.pix_fmt === 'yuv420p',
    'R2 derivative is H.264 yuv420p',
  );
  assert(audio?.codec_name === 'aac', 'R2 derivative contains AAC audio');
  assert(
    (video?.width ?? 0) <= 1920 && (video?.height ?? 0) <= 1080,
    'R2 derivative is <=1080p',
  );
  assert(
    Number(probe.format.duration) <= 600,
    'R2 derivative is within the duration limit',
  );

  console.log('Local Workflow + Container: 14 checks passed');
} finally {
  await stopServer();
  await rm(rootDevVars, {force: true});
  if (hadDevVars) await rename(savedDevVars, rootDevVars);
  await rm(state, {recursive: true, force: true});
}

function localConfig() {
  return {
    name: 'hackweek-video-workflow-smoke',
    main: path.join(root, 'src/worker/index.ts'),
    compatibility_date: '2026-08-03',
    assets: {
      directory: path.join(root, 'public'),
      not_found_handling: 'single-page-application',
      binding: 'ASSETS',
      run_worker_first: true,
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'hackweek-db',
        database_id: 'local',
        migrations_dir: path.join(root, 'migrations'),
      },
    ],
    r2_buckets: [
      {binding: 'ATTACHMENTS', bucket_name: 'hackweek-attachments-local-smoke'},
      {binding: 'VIDEOS', bucket_name: 'hackweek-videos-local-smoke'},
    ],
    workflows: [
      {
        binding: 'VIDEO_PROCESSING_WORKFLOW',
        name: 'hackweek-video-processing-local-smoke',
        class_name: 'VideoProcessingWorkflow',
      },
    ],
    containers: [
      {
        name: 'hackweek-video-processor-local-smoke',
        class_name: 'VideoProcessorContainer',
        image: path.join(root, 'Dockerfile.video-processor'),
        image_build_context: root,
        max_instances: 1,
        instance_type: 'standard-2',
      },
    ],
    durable_objects: {
      bindings: [{name: 'VIDEO_PROCESSOR', class_name: 'VideoProcessorContainer'}],
    },
    migrations: [
      {tag: 'video-processor-v1', new_sqlite_classes: ['VideoProcessorContainer']},
    ],
    vars: {
      APP_ORIGIN: origin,
      GOOGLE_CLIENT_ID: 'local.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'local-secret',
      GOOGLE_REDIRECT_URI: `${origin}/api/auth/callback`,
      ALLOWED_EMAIL_DOMAIN: 'sentry.io',
      STREAM_MODE: 'fake',
      VIDEO_PROCESSOR_CONCURRENCY: '1',
      VIDEO_PROCESSING_AUTOSTART: 'true',
    },
  };
}

function localEnvironment() {
  return {
    ...process.env,
    CLOUDFLARE_VITE_DEV_VARS_PATH: '/dev/null',
    HACKWEEK_LOCAL_STATE_PATH: state,
    HACKWEEK_WRANGLER_CONFIG: config,
    APP_ORIGIN: origin,
    GOOGLE_CLIENT_ID: 'local.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'local-secret',
    GOOGLE_REDIRECT_URI: `${origin}/api/auth/callback`,
    ALLOWED_EMAIL_DOMAIN: 'sentry.io',
    STREAM_MODE: 'fake',
    VIDEO_PROCESSOR_CONCURRENCY: '1',
    VIDEO_PROCESSING_AUTOSTART: 'true',
  };
}

async function waitForServer() {
  for (let index = 0; index < 600; index += 1) {
    if (server?.exitCode !== null)
      throw new Error(`Local server exited:\n${logs.join('')}`);
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      // Worker and Container image are still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for local Worker:\n${logs.join('')}`);
}

async function waitForReady() {
  for (let index = 0; index < 300; index += 1) {
    const result = await api('/api/projects/workflow-project/video');
    const video = result.body.video as {
      status: string;
      loudnessLufs: number;
      errorMessage: string | null;
    };
    if (video.status === 'ready') return video;
    if (video.status === 'failed') {
      throw new Error(
        `Local video processing failed: ${video.errorMessage}\n${logs.join('')}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for Workflow:\n${logs.join('')}`);
}

async function api(pathname: string, init: RequestInit = {}) {
  const headers = authenticatedHeaders(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('Origin', origin);
  const response = await fetch(`${origin}${pathname}`, {...init, headers});
  const body = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(
      `${pathname} returned ${response.status}: ${JSON.stringify(body)}\n${logs.join('')}`,
    );
  }
  return {response, body};
}

function authenticatedHeaders(init?: ConstructorParameters<typeof Headers>[0]) {
  const headers = new Headers(init);
  headers.set('Cookie', `sentry-hackweek-session=${token}`);
  return headers;
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
    '--config',
    config,
    '--command',
    command,
  ]);
}

function query<T>(command: string) {
  const json = output('npx', [
    'wrangler',
    'd1',
    'execute',
    'hackweek-db',
    '--local',
    '--persist-to',
    state,
    '--config',
    config,
    '--command',
    command,
    '--json',
  ]);
  const parsed = JSON.parse(json) as Array<{results: T[]}>;
  const row = parsed[0]?.results[0];
  if (!row) throw new Error(`D1 query returned no rows: ${command}`);
  return row;
}

function run(command: string, args: string[]) {
  execFileSync(command, args, {cwd: root, env: localEnvironment(), stdio: 'inherit'});
}

function output(command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd: root,
    env: localEnvironment(),
    encoding: 'utf8',
  });
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
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!exited) {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // The detached process group exited between checks.
    }
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value)
    throw new Error(`Local Workflow check failed: ${message}\n${logs.join('')}`);
  console.log(`✓ ${message}`);
}

function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  );
}
