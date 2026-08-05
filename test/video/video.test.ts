import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import type {ProjectWriteRequest} from '../../src/shared/projects';
import {FakeStreamGateway} from '../../src/worker/integrations/stream/fake';
import {RealStreamGateway} from '../../src/worker/integrations/stream/real';
import {loudnessGain} from '../../src/worker/services/videos';
import {createSessionCookie} from '../auth/fixture';

const base = 'https://hackweek.test/api';
const webhookSecret = 'test-webhook-secret';
let suffix = 0;
let ownerToken: string;
let outsiderToken: string;
let projectId: string;
let yearId: string;
let groupId: string;

beforeEach(async () => {
  suffix += 1;
  ownerToken = await createSessionCookie({
    sub: `video-owner-${suffix}`,
    email: `video-owner-${suffix}@sentry.io`,
  });
  outsiderToken = await createSessionCookie({
    sub: `video-outsider-${suffix}`,
    email: `video-outsider-${suffix}@sentry.io`,
  });
  await session(ownerToken);
  await session(outsiderToken);
  yearId = `video-year-${suffix}`;
  groupId = `video-group-${suffix}`;
  const owner = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(`video-owner-${suffix}`)
    .first<{id: string}>();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(yearId),
    env.DB.prepare(
      `INSERT INTO groups (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, 'Video group', ?)`,
    ).bind(groupId, groupId, yearId, owner!.id),
  ]);
  const created = await api('/projects', ownerToken, {
    method: 'POST',
    body: projectPayload(),
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  projectId = created.body.project.id;
});

describe('Cloudflare Stream gateways', () => {
  it('creates constrained direct tus requests without exposing the API token', async () => {
    const requests: Request[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(null, {
        status: 201,
        headers: {
          Location: 'https://upload.videodelivery.net/tus-once',
          'stream-media-id': 'stream-real-uid',
        },
      });
    };
    try {
      const gateway = new RealStreamGateway('account-1', 'super-secret-token');
      const upload = await gateway.createDirectUpload({
        creator: 'user-1',
        fileName: 'demo reel.mp4',
        fileSize: 300_000_000,
        maxDurationSeconds: 600,
        allowedOrigin: 'hackweek.example.com',
        expiresAt: new Date('2030-01-01T00:30:00.000Z'),
      });
      expect(upload).toMatchObject({uid: 'stream-real-uid', protocol: 'tus'});
      expect(requests[0].url).toContain('/stream?direct_user=true');
      expect(requests[0].headers.get('Authorization')).toBe('Bearer super-secret-token');
      expect(requests[0].headers.get('Upload-Length')).toBe('300000000');
      expect(requests[0].headers.get('Tus-Resumable')).toBe('1.0.0');
      const metadata = requests[0].headers.get('Upload-Metadata')!;
      expect(metadata).toContain('requiresignedurls');
      expect(metadata).toContain(`maxdurationseconds ${btoa('600')}`);
      expect(metadata).toContain(`allowedorigins ${btoa('hackweek.example.com')}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the local fake explicit and does not fabricate HLS', async () => {
    const gateway = new FakeStreamGateway();
    const upload = await gateway.createDirectUpload({
      creator: 'user',
      fileName: 'demo.mp4',
      fileSize: 42,
      maxDurationSeconds: 600,
      allowedOrigin: 'hackweek.test',
      expiresAt: new Date('2030-01-01T00:30:00Z'),
    });
    const token = await gateway.createPlaybackToken(
      upload.uid,
      new Date('2030-01-01T00:15:00Z'),
    );
    expect(upload.uploadUrl).toMatch(/^https:\/\/upload\.videodelivery\.net\/fake\//);
    expect(token).toMatch(/^fake\.playback\./);
    expect(token).not.toContain('m3u8');
  });
});

describe('video lifecycle APIs', () => {
  it('authorizes one direct primary upload and returns no secrets or bytes', async () => {
    const forbidden = await api(`/projects/${projectId}/video/upload`, outsiderToken, {
      method: 'POST',
      body: {fileName: 'demo.mp4', fileSize: 300_000_000},
    });
    const created = await api(`/projects/${projectId}/video/upload`, ownerToken, {
      method: 'POST',
      body: {fileName: 'demo.mp4', fileSize: 300_000_000},
    });
    const duplicate = await api(`/projects/${projectId}/video/upload`, ownerToken, {
      method: 'POST',
      body: {fileName: 'another.mp4', fileSize: 10},
    });

    expect(forbidden.status).toBe(403);
    expect(created.status).toBe(201);
    expect(created.body.upload).toMatchObject({protocol: 'tus', chunkSize: 52_428_800});
    expect(created.body.video.status).toBe('uploading');
    const serialized = JSON.stringify(created.body);
    expect(serialized).not.toMatch(/api.?token|secret|fileSize|fileName/i);
    expect(duplicate.status).toBe(409);
  });

  it('verifies webhooks and deduplicates lifecycle events', async () => {
    const created = await createUpload();
    const payload = JSON.stringify({
      uid: created.video.streamUid,
      readyToStream: true,
      modified: '2030-01-01T00:00:00Z',
      duration: 92.5,
      status: {state: 'ready', pctComplete: '100.000000'},
    });
    const invalid = await SELF.fetch(`${base}/stream-webhook`, {
      method: 'POST',
      headers: {'Webhook-Signature': 'time=1,sig1=bad'},
      body: payload,
    });
    const signature = await webhookSignature(payload);
    const first = await SELF.fetch(`${base}/stream-webhook`, {
      method: 'POST',
      headers: {'Webhook-Signature': signature},
      body: payload,
    });
    const duplicate = await SELF.fetch(`${base}/stream-webhook`, {
      method: 'POST',
      headers: {'Webhook-Signature': signature},
      body: payload,
    });
    const stored = await env.DB.prepare(
      'SELECT status, duration_seconds FROM project_videos WHERE id = ?',
    )
      .bind(created.video.id)
      .first<{status: string; duration_seconds: number}>();
    const eventCount = await env.DB.prepare(
      'SELECT COUNT(*) count FROM stream_events WHERE stream_uid = ?',
    )
      .bind(created.video.streamUid)
      .first<{count: number}>();

    expect(invalid.status).toBe(401);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({handled: true, duplicate: false});
    expect(await duplicate.json()).toMatchObject({handled: true, duplicate: true});
    expect(stored).toMatchObject({status: 'measuring', duration_seconds: 92.5});
    expect(eventCount?.count).toBe(1);
  });

  it('clamps exact -16 LUFS gain and only playlists measured ready videos', async () => {
    const created = await createUpload();
    await moveToMeasuring(created.video.streamUid);
    await env.DB.prepare(
      'INSERT INTO screening_order (year_id, project_id, position) VALUES (?, ?, 0)',
    )
      .bind(yearId, projectId)
      .run();

    const before = await api(`/videos/playlist?year=${yearId}`, ownerToken);
    const measured = await serviceApi(`/video-jobs/measurements/${created.video.id}`, {
      method: 'POST',
      body: {loudnessLufs: -31, durationSeconds: 92.5},
    });
    const after = await api(`/videos/playlist?year=${yearId}`, ownerToken);
    const playback = await api(`/videos/${created.video.id}/playback`, ownerToken);

    expect(loudnessGain(-31)).toBe(12);
    expect(loudnessGain(0)).toBe(-12);
    expect(loudnessGain(-18.5)).toBe(2.5);
    expect(before.body.videos).toEqual([]);
    expect(measured.body.video).toMatchObject({status: 'ready', gainDb: 12});
    expect(after.body.videos).toEqual([
      expect.objectContaining({videoId: created.video.id, gainDb: 12}),
    ]);
    expect(playback.body).toMatchObject({mode: 'fake', manifestUrl: null});
    expect(playback.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('promotes selected historical R2 video media through the same record', async () => {
    const mediaId = `video-media-${suffix}`;
    await env.DB.prepare(
      `INSERT INTO media
        (id, source_id, project_id, original_name, r2_key, media_type, status)
       VALUES (?, ?, ?, 'old-demo.mp4', ?, 'video/mp4', 'available')`,
    )
      .bind(mediaId, mediaId, projectId, `media/${mediaId}.mp4`)
      .run();
    const promoted = await api(`/projects/${projectId}/video/promote`, ownerToken, {
      method: 'POST',
      body: {sourceMediaId: mediaId},
    });

    expect(promoted.status).toBe(201);
    expect(promoted.body.video).toMatchObject({
      projectId,
      sourceMediaId: mediaId,
      status: 'processing',
    });
  });

  it('uses distinct service auth and keeps archive off readiness', async () => {
    const created = await createUpload();
    await moveToMeasuring(created.video.streamUid);
    await serviceApi(`/video-jobs/measurements/${created.video.id}`, {
      method: 'POST',
      body: {loudnessLufs: -16, durationSeconds: 20},
    });
    const unauthenticated = await SELF.fetch(`${base}/video-jobs/archives`);
    const queue = await serviceApi('/video-jobs/archives');
    const failed = await serviceApi(`/video-jobs/archives/${created.video.id}`, {
      method: 'POST',
      body: {status: 'failed', error: 'Drive quota exhausted'},
    });
    const stillReady = await env.DB.prepare(
      'SELECT status, archive_status FROM project_videos WHERE id = ?',
    )
      .bind(created.video.id)
      .first<{status: string; archive_status: string}>();

    expect(unauthenticated.status).toBe(401);
    expect(queue.body.videos).toContainEqual(
      expect.objectContaining({videoId: created.video.id}),
    );
    expect(failed.body.video).toMatchObject({status: 'ready', archiveStatus: 'failed'});
    expect(stillReady).toEqual({status: 'ready', archive_status: 'failed'});
  });

  it('exposes measurement failures as retryable state', async () => {
    const created = await createUpload();
    await moveToMeasuring(created.video.streamUid);
    const failed = await serviceApi(
      `/video-jobs/measurements/${created.video.id}/failure`,
      {method: 'POST', body: {error: 'No audio stream'}},
    );
    const stored = await env.DB.prepare(
      'SELECT status, failure_stage FROM project_videos WHERE id = ?',
    )
      .bind(created.video.id)
      .first<{status: string; failure_stage: string}>();
    const retried = await api(`/videos/${created.video.id}/retry`, ownerToken, {
      method: 'POST',
    });

    expect(failed.status).toBe(204);
    expect(stored).toEqual({status: 'failed', failure_stage: 'measurement'});
    expect(retried.body.video.status).toBe('measuring');
  });
});

async function createUpload() {
  const response = await api(`/projects/${projectId}/video/upload`, ownerToken, {
    method: 'POST',
    body: {fileName: 'demo.mp4', fileSize: 300_000_000},
  });
  expect(response.status).toBe(201);
  return response.body;
}

async function moveToMeasuring(streamUid: string) {
  const payload = JSON.stringify({
    uid: streamUid,
    readyToStream: true,
    modified: `2030-01-01T00:00:0${suffix % 10}Z`,
    duration: 20,
    status: {state: 'ready', pctComplete: '100'},
  });
  const response = await SELF.fetch(`${base}/stream-webhook`, {
    method: 'POST',
    headers: {'Webhook-Signature': await webhookSignature(payload)},
    body: payload,
  });
  expect(response.status).toBe(200);
}

async function webhookSignature(body: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const signature = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `time=${timestamp},sig1=${signature}`;
}

function projectPayload(): ProjectWriteRequest {
  return {
    yearId,
    name: 'Video project',
    summary: 'Project with a directly uploaded primary demo video.',
    repository: null,
    kind: 'project',
    groupId,
    memberIds: [],
    needsHelp: false,
    helpDetails: null,
  };
}

function session(token: string) {
  return SELF.fetch(`${base}/session`, {
    headers: {Cookie: token},
  });
}

async function api(
  path: string,
  token: string,
  options: {method?: string; body?: unknown} = {},
) {
  const response = await SELF.fetch(`${base}${path}`, {
    method: options.method,
    headers: {
      Cookie: token,
      ...(options.method && options.method !== 'GET'
        ? {Origin: 'https://hackweek.test'}
        : {}),
      ...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return parseResponse(response);
}

async function serviceApi(path: string, options: {method?: string; body?: unknown} = {}) {
  const response = await SELF.fetch(`${base}${path}`, {
    method: options.method,
    headers: {
      Authorization: 'Bearer test-video-service-token',
      ...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return parseResponse(response);
}

async function parseResponse(response: Response) {
  const body = response.status === 204 ? null : await response.json<any>();
  return {status: response.status, body, headers: response.headers};
}
