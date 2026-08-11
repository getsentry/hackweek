#!/usr/bin/env node
import {execFileSync, spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = process.cwd();
const fixture = path.join(root, 'test/fixtures/firebase');
const state = await mkdtemp(path.join(tmpdir(), 'hackweek-readiness-'));
const port = Number(process.env.READINESS_PORT ?? 5199);
const origin = `http://127.0.0.1:${port}`;
const config = path.join(state, 'wrangler.readiness.json');
const source = path.join(state, 'readiness-source.mp4');
const original = path.join(state, 'readiness-original.mp4');
const derivative = path.join(state, 'readiness-derivative.mp4');
const googleClientId = 'local-readiness.apps.googleusercontent.com';
const googleClientSecret = 'synthetic-readiness-value';
const sessionToken = createHash('sha256')
  .update('hackweek-local-readiness')
  .digest('base64url');
const sessionTokenHash = createHash('sha256').update(sessionToken).digest('hex');
const rootDevVars = path.join(root, '.dev.vars');
const devVarsBefore = await optionalFile(rootDevVars);
const dockerContainersBefore = new Set(dockerContainerNames());
let server: ChildProcess | undefined;
const serverLog: string[] = [];

try {
  await writeFile(config, JSON.stringify(localConfig()), {mode: 0o600});
  await writeFile(path.join(state, '.dev.vars'), localDevVars(), {mode: 0o600});

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
    '--bucket-name',
    'hackweek-attachments-readiness',
    '--config',
    config,
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
    '--bucket-name',
    'hackweek-attachments-readiness',
    '--config',
    config,
    '--persist-to',
    state,
  ]);

  const now = Math.floor(Date.now() / 1000);
  sql(`
    INSERT INTO users
      (id, source_uid, google_subject, email, display_name, avatar_url, is_admin)
    VALUES
      ('readiness-user', 'readiness-user', 'google-readiness-user',
       'developer@sentry.io', 'Local Developer', NULL, 1);
    INSERT INTO user_sessions
      (token_hash, user_id, expires_at, created_at, last_used_at)
    VALUES ('${sessionTokenHash}', 'readiness-user', ${now + 28_800}, ${now}, ${now});
    INSERT INTO years (id) VALUES ('9999');
    INSERT INTO groups (id, source_id, year_id, name, creator_id)
    VALUES ('readiness-group', 'readiness-group', '9999', 'Readiness Team', 'readiness-user');
    INSERT INTO projects
      (id, source_id, year_id, creator_id, group_id, name, summary, kind)
    VALUES
      ('readiness-project', 'readiness-project', '9999', 'readiness-user',
       'readiness-group', 'Readiness Video', 'Real local video E2E', 'project');
    INSERT INTO project_members (project_id, user_id)
    VALUES ('readiness-project', 'readiness-user');
  `);

  ffmpeg([
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
  server.stdout?.on('data', (chunk) => serverLog.push(String(chunk)));
  server.stderr?.on('data', (chunk) => serverLog.push(String(chunk)));
  await waitForServer();

  const login = await request('/api/auth/login', {redirect: 'manual'});
  const authorization = new URL(login.headers.get('Location')!);
  assert(
    authorization.searchParams.get('client_id') === googleClientId,
    'loopback Google OAuth configuration is active',
  );
  const session = await get('/api/session');
  assert(
    session.user.role === 'admin' && session.user.email === 'developer@sentry.io',
    'seeded D1 session authenticates the readiness administrator',
  );
  const unauthorized = await fetch(`${origin}/api/projects/readiness-project/video`);
  assert(unauthorized.status === 401, 'video APIs reject unauthenticated requests');

  const projects = await get('/api/projects?year=2024&limit=50');
  assert(
    projects.projects.some(
      (project: {name: string}) => project.name === 'Historical Telescope',
    ),
    'isolated D1 contains the migrated archive fixture',
  );
  const historical = await get('/api/projects/project-history');
  const media = await request(`/api/media/${historical.project.media[0].id}/content`);
  assert(
    media.status === 200 && (await media.text()).includes('Synthetic'),
    'isolated attachment R2 contains reconciled fixture bytes',
  );

  await sendJson('PUT', '/api/admin/years/9999/screening-order', {
    projectIds: ['readiness-project'],
  });
  const bytes = await readFile(source);
  const created = await sendJson(
    'POST',
    '/api/projects/readiness-project/video/upload',
    {
      fileName: 'readiness-source.mp4',
      fileSize: bytes.byteLength,
      contentType: 'video/mp4',
    },
    201,
  );
  assert(
    created.upload.status === 'uploading' && created.upload.completedParts.length === 0,
    'real local R2 multipart upload is created',
  );
  const uploadId = created.upload.uploadId as string;
  const interrupted = await get(
    `/api/projects/readiness-project/video/upload/${uploadId}`,
  );
  assert(
    interrupted.upload.completedParts.length === 0,
    'an interrupted upload resumes from durable server state',
  );

  const partResponse = await request(
    `/api/projects/readiness-project/video/upload/${uploadId}/parts/1`,
    {
      method: 'PUT',
      headers: {
        Origin: origin,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
      },
      body: bytes,
    },
  );
  const partBody = await responseJson(partResponse);
  assert(partResponse.status === 200, 'generated media bytes stream into multipart R2');
  const resumed = await get(`/api/projects/readiness-project/video/upload/${uploadId}`);
  assert(
    resumed.upload.completedParts[0]?.etag === partBody.part.etag,
    'uploaded part ETag survives a resume lookup',
  );

  const completionPath = `/api/projects/readiness-project/video/upload/${uploadId}/complete`;
  const completionInput = {
    parts: [{partNumber: 1, etag: partBody.part.etag}],
  };
  const completed = await sendJson('POST', completionPath, completionInput);
  assert(completed.video.status === 'queued', 'multipart completion queues processing');
  const videoId = completed.video.id as string;
  const duplicate = await sendJson('POST', completionPath, completionInput);
  assert(
    duplicate.video.id === videoId && duplicate.video.processingAttempt === 1,
    'duplicate completion reuses the fenced Workflow attempt',
  );

  const ready = await waitForReady();
  assert(ready.status === 'ready', 'local Workflow conditionally publishes ready state');
  assert(
    Math.abs(ready.loudnessLufs + 16) <= 0.7,
    'ready metadata records normalized loudness within ±0.7 LU',
  );

  const workflowEvidence = output('npx', [
    'wrangler',
    'workflows',
    'instances',
    'describe',
    'hackweek-video-processing-readiness',
    `video-${videoId}-attempt-1`,
    '--local',
    '--port',
    String(port),
    '--config',
    config,
  ]);
  assert(
    workflowEvidence.includes('run pinned ffmpeg processor') &&
      workflowEvidence.toLowerCase().includes('complete'),
    'local Workflow records a completed pinned FFmpeg Container step',
  );

  const descriptor = await get(`/api/videos/${videoId}/playback`);
  assert(
    descriptor.source.kind === 'mp4' &&
      descriptor.source.url === `/api/videos/${videoId}/content`,
    'playback returns a storage-neutral authenticated MP4 descriptor',
  );
  const unauthorizedContent = await fetch(`${origin}/api/videos/${videoId}/content`);
  assert(
    unauthorizedContent.status === 401,
    'private derivative rejects anonymous reads',
  );
  const full = await request(`/api/videos/${videoId}/content`);
  const fullBytes = Buffer.from(await full.arrayBuffer());
  assert(
    full.status === 200 &&
      full.headers.get('accept-ranges') === 'bytes' &&
      fullBytes.byteLength > 0,
    'authenticated full playback returns real derivative bytes',
  );
  const rangeEnd = Math.min(1023, fullBytes.byteLength - 1);
  const partial = await request(`/api/videos/${videoId}/content`, {
    headers: {Range: `bytes=0-${rangeEnd}`},
  });
  const partialBytes = Buffer.from(await partial.arrayBuffer());
  assert(
    partial.status === 206 &&
      partial.headers.get('content-range') ===
        `bytes 0-${rangeEnd}/${fullBytes.byteLength}` &&
      partialBytes.equals(fullBytes.subarray(0, rangeEnd + 1)),
    'authenticated range playback returns the exact derivative slice',
  );
  const unsatisfiable = await request(`/api/videos/${videoId}/content`, {
    headers: {Range: `bytes=${fullBytes.byteLength}-`},
  });
  assert(
    unsatisfiable.status === 416 &&
      unsatisfiable.headers.get('content-range') === `bytes */${fullBytes.byteLength}`,
    'unsatisfiable playback range returns deterministic 416 metadata',
  );

  const playlist = await get('/api/videos/playlist?year=9999');
  assert(
    playlist.videos.length === 1 &&
      playlist.videos[0].videoId === videoId &&
      playlist.videos[0].projectName === 'Readiness Video' &&
      playlist.videos[0].groupName === 'Readiness Team' &&
      playlist.videos[0].teamMembers.includes('Local Developer'),
    'ready derivative appears in the reel without a manual screening entry',
  );

  await sendJson('DELETE', '/api/projects/readiness-project/video', {confirmed: true});
  const afterRetirement = await get('/api/videos/playlist?year=9999');
  assert(afterRetirement.videos.length === 0, 'retired video leaves the curated reel');
  const retiredPlayback = await request(`/api/videos/${videoId}/content`);
  assert(retiredPlayback.status === 409, 'retired derivative is no longer playable');

  await stopServer();
  const row = query<{
    original_r2_key: string;
    processed_r2_key: string;
    status: string;
  }>(
    `SELECT original_r2_key, processed_r2_key, status FROM video_submissions WHERE id = '${escapeSql(videoId)}'`,
  );
  assert(
    row.status === 'retired' && row.original_r2_key !== row.processed_r2_key,
    'D1 retains distinct immutable original and derivative keys after retirement',
  );
  getR2Object(row.original_r2_key, original);
  getR2Object(row.processed_r2_key, derivative);
  assert(
    createHash('sha256')
      .update(await readFile(original))
      .digest('hex') === createHash('sha256').update(bytes).digest('hex'),
    'retained R2 original matches the generated upload bytes',
  );
  assert(
    (await stat(derivative)).size === fullBytes.byteLength,
    'retained R2 derivative matches playback bytes',
  );

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
  ) as Probe;
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  assert(
    video?.codec_name === 'h264' &&
      video.pix_fmt === 'yuv420p' &&
      (video.width ?? 0) <= 1920 &&
      (video.height ?? 0) <= 1080,
    'ffprobe confirms H.264 yuv420p output at or below 1080p',
  );
  assert(audio?.codec_name === 'aac', 'ffprobe confirms canonical AAC audio');
  assert(Number(probe.format.duration) <= 600, 'ffprobe confirms bounded duration');
  assert(await hasFastStart(derivative), 'canonical MP4 places moov before mdat');
  const measuredLoudness = measureLoudness(derivative);
  assert(
    Math.abs(measuredLoudness + 16) <= 0.7,
    `ffmpeg measures canonical output at ${measuredLoudness} LUFS`,
  );

  console.log('Local video readiness: 30 checks passed');
} finally {
  await stopServer();
  cleanupReadinessContainers();
  const devVarsAfter = await optionalFile(rootDevVars);
  const devVarsPreserved = sameOptionalBytes(devVarsBefore, devVarsAfter);
  await rm(state, {recursive: true, force: true});
  if (!devVarsPreserved) {
    console.error('Developer .dev.vars changed during isolated readiness');
    process.exitCode = 1;
  }
}

interface Probe {
  streams: Array<{
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
  }>;
  format: {duration: string};
}

function localConfig() {
  return {
    name: 'hackweek-video-readiness',
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
      {binding: 'ATTACHMENTS', bucket_name: 'hackweek-attachments-readiness'},
      {binding: 'VIDEOS', bucket_name: 'hackweek-videos-readiness'},
    ],
    workflows: [
      {
        binding: 'VIDEO_PROCESSING_WORKFLOW',
        name: 'hackweek-video-processing-readiness',
        class_name: 'VideoProcessingWorkflow',
      },
    ],
    containers: [
      {
        name: 'hackweek-video-processor-readiness',
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
      GOOGLE_CLIENT_ID: googleClientId,
      GOOGLE_CLIENT_SECRET: googleClientSecret,
      GOOGLE_REDIRECT_URI: `${origin}/api/auth/callback`,
      ALLOWED_EMAIL_DOMAIN: 'sentry.io',
      VIDEO_PROCESSOR_CONCURRENCY: '1',
      VIDEO_PROCESSING_AUTOSTART: 'true',
    },
    observability: {enabled: true},
  };
}

function localDevVars() {
  return `APP_ORIGIN="${origin}"\nGOOGLE_CLIENT_ID="${googleClientId}"\nGOOGLE_CLIENT_SECRET="${googleClientSecret}"\nGOOGLE_REDIRECT_URI="${origin}/api/auth/callback"\nALLOWED_EMAIL_DOMAIN="sentry.io"\nVIDEO_PROCESSOR_CONCURRENCY="1"\nVIDEO_PROCESSING_AUTOSTART="true"\n`;
}

function localEnvironment() {
  return {
    ...process.env,
    HACKWEEK_LOCAL_STATE_PATH: state,
    HACKWEEK_WRANGLER_CONFIG: config,
    APP_ORIGIN: origin,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    GOOGLE_REDIRECT_URI: `${origin}/api/auth/callback`,
    ALLOWED_EMAIL_DOMAIN: 'sentry.io',
    VIDEO_PROCESSOR_CONCURRENCY: '1',
    VIDEO_PROCESSING_AUTOSTART: 'true',
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 1_200; attempt += 1) {
    if (server?.exitCode !== null) {
      throw new Error(`Local server exited early:\n${serverLog.join('')}`);
    }
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      // Worker and Container image are still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for local server:\n${serverLog.join('')}`);
}

async function waitForReady() {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const response = await get('/api/projects/readiness-project/video');
    const video = response.video as {
      status: string;
      loudnessLufs: number;
      errorMessage: string | null;
    };
    if (video.status === 'ready') return video;
    if (video.status === 'failed') {
      throw new Error(
        `Local video processing failed: ${video.errorMessage}\n${serverLog.join('')}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Workflow:\n${serverLog.join('')}`);
}

async function get(pathname: string) {
  const response = await request(pathname);
  return responseJson(response);
}

async function sendJson(
  method: 'POST' | 'PUT' | 'DELETE',
  pathname: string,
  body: unknown,
  expectedStatus = method === 'DELETE' ? 204 : 200,
) {
  const response = await request(pathname, {
    method,
    headers: {'Content-Type': 'application/json', Origin: origin},
    body: JSON.stringify(body),
  });
  if (response.status !== expectedStatus) {
    throw new Error(
      `${pathname} returned ${response.status}, expected ${expectedStatus}: ${await response.text()}\n${serverLog.join('')}`,
    );
  }
  return response.status === 204 ? null : ((await response.json()) as any);
}

async function responseJson(response: Response) {
  if (!response.ok) {
    throw new Error(
      `${new URL(response.url).pathname} returned ${response.status}: ${await response.text()}\n${serverLog.join('')}`,
    );
  }
  return response.json() as Promise<any>;
}

function request(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', `sentry-hackweek-session=${sessionToken}`);
  return fetch(`${origin}${pathname}`, {...init, headers});
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
  const parsed = JSON.parse(
    output('npx', [
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
    ]),
  ) as Array<{results: T[]}>;
  const row = parsed[0]?.results[0];
  if (!row) throw new Error(`D1 query returned no rows: ${command}`);
  return row;
}

function getR2Object(key: string, destination: string) {
  run('npx', [
    'wrangler',
    'r2',
    'object',
    'get',
    `hackweek-videos-readiness/${key}`,
    '--file',
    destination,
    '--local',
    '--persist-to',
    state,
    '--config',
    config,
  ]);
}

function ffmpeg(args: string[]) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args]);
}

function measureLoudness(file: string) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-af',
      'loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json',
      '-f',
      'null',
      '-',
    ],
    {cwd: root, encoding: 'utf8'},
  );
  if (result.status !== 0) {
    throw new Error(`Loudness probe failed:\n${result.stdout}\n${result.stderr}`);
  }
  const blocks = [...result.stderr.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  const input = blocks.at(-1)?.[0];
  const loudness = input ? Number(JSON.parse(input).input_i) : Number.NaN;
  if (!Number.isFinite(loudness)) throw new Error('Loudness probe returned no value');
  return loudness;
}

async function hasFastStart(file: string) {
  const bytes = await readFile(file);
  const moov = bytes.indexOf(Buffer.from('moov'));
  const mdat = bytes.indexOf(Buffer.from('mdat'));
  return moov >= 0 && mdat >= 0 && moov < mdat;
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

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: root,
    env: localEnvironment(),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

function output(command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd: root,
    env: localEnvironment(),
    encoding: 'utf8',
  });
}

function assert(value: unknown, message: string): asserts value {
  if (!value)
    throw new Error(`Readiness check failed: ${message}\n${serverLog.join('')}`);
  console.log(`✓ ${message}`);
}

function escapeSql(value: string) {
  return value.replaceAll("'", "''");
}

function optionalFile(file: string) {
  return readFile(file).then(
    (contents) => contents,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    },
  );
}

function sameOptionalBytes(left: Buffer | null, right: Buffer | null) {
  return left === null ? right === null : right !== null && left.equals(right);
}

function dockerContainerNames() {
  const result = spawnSync('docker', ['ps', '--all', '--format', '{{.Names}}'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
}

function cleanupReadinessContainers() {
  for (const name of dockerContainerNames()) {
    if (
      !dockerContainersBefore.has(name) &&
      name.startsWith('workerd-hackweek-video-readiness-')
    ) {
      spawnSync('docker', ['rm', '--force', name], {cwd: root, stdio: 'ignore'});
    }
  }
}
