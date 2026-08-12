import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import type {ProjectWriteRequest} from '../../src/shared/projects';
import {
  claimVideoProcessingAttempt,
  completeVideoUpload,
  createMultipartVideoUpload,
  failVideoProcessingAttempt,
  MAX_VIDEO_BYTES,
  publishVideoProcessingAttempt,
  reapExpiredMultipartVideoUploads,
  VIDEO_PART_SIZE,
} from '../../src/worker/services/videos';
import type {VideoProcessorResult} from '../../src/worker/video-processing';
import {createSessionCookie} from '../auth/fixture';

const base = 'https://hackweek.test/api';
let suffix = 0;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
let ownerId: string;
let memberId: string;
let projectId: string;
let yearId: string;
let groupId: string;

beforeEach(async () => {
  suffix += 1;
  ownerToken = await createSessionCookie({
    sub: `video-owner-${suffix}`,
    email: `video-owner-${suffix}@sentry.io`,
  });
  memberToken = await createSessionCookie({
    sub: `video-member-${suffix}`,
    email: `video-member-${suffix}@sentry.io`,
  });
  outsiderToken = await createSessionCookie({
    sub: `video-outsider-${suffix}`,
    email: `video-outsider-${suffix}@sentry.io`,
  });
  await Promise.all([session(ownerToken), session(memberToken), session(outsiderToken)]);
  const owner = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(`video-owner-${suffix}`)
    .first<{id: string}>();
  const member = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(`video-member-${suffix}`)
    .first<{id: string}>();
  ownerId = owner!.id;
  memberId = member!.id;
  yearId = `zzzz-video-year-${String(suffix).padStart(4, '0')}`;
  groupId = `video-group-${suffix}`;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(yearId),
    env.DB.prepare(
      `INSERT INTO groups (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, 'Video group', ?)`,
    ).bind(groupId, groupId, yearId, ownerId),
  ]);
  projectId = await createProject('Video project');
  await env.DB.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)')
    .bind(projectId, memberId)
    .run();
});

describe('R2 multipart video lifecycle', () => {
  it('streams resumable parts, completes idempotently, and records the queued handoff', async () => {
    const forbidden = await createUpload(projectId, outsiderToken, 11);
    expect(forbidden.status).toBe(403);

    const created = await createUpload(projectId, memberToken, 11);
    expect(created.status).toBe(201);
    expect(created.body.video).toBeNull();
    expect(created.body.upload).toMatchObject({
      projectId,
      fileSize: 11,
      partSize: VIDEO_PART_SIZE,
      status: 'uploading',
      completedParts: [],
    });

    const uploadId = created.body.upload.uploadId as string;
    const firstPart = await putPart(
      projectId,
      uploadId,
      1,
      new TextEncoder().encode('hello video'),
      memberToken,
    );
    const duplicatePart = await putPart(
      projectId,
      uploadId,
      1,
      new TextEncoder().encode('hello video'),
      memberToken,
    );
    expect(firstPart.status).toBe(200);
    expect(duplicatePart.body.part.etag).toBe(firstPart.body.part.etag);

    const resumed = await api(
      `/projects/${projectId}/video/upload/${uploadId}`,
      memberToken,
    );
    expect(resumed.body.upload.completedParts).toEqual([firstPart.body.part]);

    const parts = [
      {
        partNumber: firstPart.body.part.partNumber,
        etag: firstPart.body.part.etag,
      },
    ];
    const completed = await api(
      `/projects/${projectId}/video/upload/${uploadId}/complete`,
      memberToken,
      {method: 'POST', body: {parts}},
    );
    const duplicateCompletion = await api(
      `/projects/${projectId}/video/upload/${uploadId}/complete`,
      memberToken,
      {method: 'POST', body: {parts}},
    );

    expect(completed.status).toBe(200);
    expect(completed.body.video).toMatchObject({
      projectId,
      status: 'queued',
      sizeBytes: 11,
      originalName: 'demo.mp4',
      processingAttempt: 1,
    });
    expect(duplicateCompletion.body.video.id).toBe(completed.body.video.id);

    const stored = await env.DB.prepare(
      `SELECT original_r2_key FROM video_submissions WHERE id = ?`,
    )
      .bind(completed.body.video.id)
      .first<{original_r2_key: string}>();
    const attempt = await env.DB.prepare(
      `SELECT attempt, status FROM video_processing_attempts WHERE video_id = ?`,
    )
      .bind(completed.body.video.id)
      .first<{attempt: number; status: string}>();
    expect((await env.VIDEOS.head(stored!.original_r2_key))?.size).toBe(11);
    expect(attempt).toEqual({attempt: 1, status: 'queued'});
  });

  it('enforces one active project slot in D1 while different projects stay independent', async () => {
    const sameProject = await Promise.all([
      createUpload(projectId, ownerToken, 20),
      createUpload(projectId, ownerToken, 20),
    ]);
    expect(sameProject.map(({status}) => status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);

    const left = await createProject('Independent left');
    const right = await createProject('Independent right');
    const independent = await Promise.all([
      createUpload(left, ownerToken, 20),
      createUpload(right, ownerToken, 20),
    ]);
    expect(independent.map(({status}) => status)).toEqual([201, 201]);

    const activeIndex = await env.DB.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index'
       AND name = 'video_submissions_active_project_idx'`,
    ).first<{sql: string}>();
    expect(activeIndex?.sql).toContain('WHERE retired_at IS NULL');
  });

  it('reaps an expired upload with lost resume state before creating a fresh upload', async () => {
    const stale = await createUpload(projectId, ownerToken, 11);
    const staleUploadId = stale.body.upload.uploadId as string;
    expect(
      (
        await putPart(
          projectId,
          staleUploadId,
          1,
          new TextEncoder().encode('stale video'),
          ownerToken,
        )
      ).status,
    ).toBe(200);
    const staleStorage = await uploadStorage(staleUploadId);
    await expireUpload(staleUploadId);

    const fresh = await createUpload(projectId, ownerToken, 12);
    expect(fresh.status).toBe(201);
    expect(fresh.body.upload.uploadId).not.toBe(staleUploadId);
    expect(
      await env.DB.prepare('SELECT status FROM video_uploads WHERE id = ?')
        .bind(staleUploadId)
        .first('status'),
    ).toBe('expired');
    expect(await env.VIDEOS.head(staleStorage.original_r2_key)).toBeNull();
    await expect(
      env.VIDEOS.resumeMultipartUpload(
        staleStorage.original_r2_key,
        staleStorage.r2_upload_id,
      ).uploadPart(1, new Uint8Array([1]).buffer),
    ).rejects.toThrow(/multipart upload does not exist|10024/i);
  });

  it('retries idempotent expiry cleanup without releasing after transient R2 failure', async () => {
    const stale = await createUpload(projectId, ownerToken, 10);
    const staleUploadId = stale.body.upload.uploadId as string;
    await expireUpload(staleUploadId);
    const failingBucket = {
      resumeMultipartUpload() {
        return {
          abort: async () => {
            throw new Error('temporary R2 outage');
          },
        };
      },
    } as unknown as R2Bucket;

    await expect(
      reapExpiredMultipartVideoUploads(env.DB, failingBucket, {projectId, limit: 1}),
    ).rejects.toMatchObject({code: 'SERVICE_UNAVAILABLE', status: 503});
    expect(
      await env.DB.prepare('SELECT status FROM video_uploads WHERE id = ?')
        .bind(staleUploadId)
        .first('status'),
    ).toBe('expiring');
    expect((await createUpload(projectId, ownerToken, 12)).status).toBe(201);
    expect(
      await env.DB.prepare('SELECT status FROM video_uploads WHERE id = ?')
        .bind(staleUploadId)
        .first('status'),
    ).toBe('expired');
  });

  it('handles missing multipart state and simultaneous fresh creates idempotently', async () => {
    const stale = await createUpload(projectId, ownerToken, 10);
    const staleUploadId = stale.body.upload.uploadId as string;
    const staleStorage = await uploadStorage(staleUploadId);
    await env.VIDEOS.resumeMultipartUpload(
      staleStorage.original_r2_key,
      staleStorage.r2_upload_id,
    ).abort();
    await expireUpload(staleUploadId);

    const fresh = await Promise.all([
      createUpload(projectId, ownerToken, 12),
      createUpload(projectId, ownerToken, 12),
    ]);
    expect(fresh.map(({status}) => status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(
      await env.DB.prepare('SELECT status FROM video_uploads WHERE id = ?')
        .bind(staleUploadId)
        .first('status'),
    ).toBe('expired');
  });

  it('fences an expired upload before an old completion can publish', async () => {
    const stale = await createUpload(projectId, ownerToken, 11);
    const staleUploadId = stale.body.upload.uploadId as string;
    const part = await putPart(
      projectId,
      staleUploadId,
      1,
      new TextEncoder().encode('stale video'),
      ownerToken,
    );
    expect(part.status).toBe(200);
    await expireUpload(staleUploadId);

    const fresh = createUpload(projectId, ownerToken, 12);
    const completion = api(
      `/projects/${projectId}/video/upload/${staleUploadId}/complete`,
      ownerToken,
      {
        method: 'POST',
        body: {parts: [{partNumber: 1, etag: part.body.part.etag}]},
      },
    );
    const [freshResult, completionResult] = await Promise.all([fresh, completion]);
    expect(freshResult.status).toBe(201);
    expect(completionResult.status).toBe(409);
    expect(
      await env.DB.prepare('SELECT status FROM video_uploads WHERE id = ?')
        .bind(staleUploadId)
        .first('status'),
    ).toBe('expired');
  });

  it('leases an in-flight completion against a concurrent fresh create', async () => {
    const created = await createUpload(projectId, ownerToken, 11);
    const uploadId = created.body.upload.uploadId as string;
    const part = await putPart(
      projectId,
      uploadId,
      1,
      new TextEncoder().encode('final video'),
      ownerToken,
    );
    expect(part.status).toBe(200);
    const upload = await uploadStorage(uploadId);
    const completionStart = new Date('2030-01-01T00:00:00.000Z');
    await env.DB.prepare('UPDATE video_uploads SET expires_at = ? WHERE id = ?')
      .bind('2030-01-01T00:01:00.000Z', uploadId)
      .run();

    let enteredCompletion!: () => void;
    let releaseCompletion!: () => void;
    const completionEntered = new Promise<void>((resolve) => {
      enteredCompletion = resolve;
    });
    const completionReleased = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    const multipart = env.VIDEOS.resumeMultipartUpload(
      upload.original_r2_key,
      upload.r2_upload_id,
    );
    const blockingBucket = {
      head: env.VIDEOS.head.bind(env.VIDEOS),
      resumeMultipartUpload() {
        return {
          complete: async (parts: R2UploadedPart[]) => {
            enteredCompletion();
            await completionReleased;
            return multipart.complete(parts);
          },
        };
      },
    } as unknown as R2Bucket;
    const owner = {
      id: ownerId,
      email: `video-owner-${suffix}@sentry.io`,
      displayName: 'Hackweek Member',
      avatarUrl: null,
      role: 'member' as const,
      actualRole: 'member' as const,
    };

    const completing = completeVideoUpload(
      env.DB,
      blockingBucket,
      null,
      projectId,
      uploadId,
      [{partNumber: 1, etag: part.body.part.etag}],
      owner,
      completionStart,
    );
    await completionEntered;
    try {
      await expect(
        createMultipartVideoUpload(
          env.DB,
          env.VIDEOS,
          projectId,
          owner,
          {fileName: 'replacement.mp4', fileSize: 12, contentType: 'video/mp4'},
          new Date('2030-01-01T00:02:00.000Z'),
        ),
      ).rejects.toMatchObject({code: 'CONFLICT', status: 409});
    } finally {
      releaseCompletion();
    }
    await expect(completing).resolves.toMatchObject({status: 'queued'});
  });

  it('retires only with confirmation, retains the original, and requires a fresh replacement', async () => {
    const {video, key} = await completeSmallUpload(projectId, ownerToken, 'first video');
    const unconfirmed = await api(`/projects/${projectId}/video`, ownerToken, {
      method: 'DELETE',
      body: {confirmed: false},
    });
    expect(unconfirmed.status).toBe(400);

    const retired = await api(`/projects/${projectId}/video`, ownerToken, {
      method: 'DELETE',
      body: {confirmed: true},
    });
    expect(retired.status).toBe(204);
    expect(await env.VIDEOS.head(key)).not.toBeNull();
    const retiredRow = await env.DB.prepare(
      'SELECT status, original_r2_key FROM video_submissions WHERE id = ?',
    )
      .bind(video.id)
      .first<{status: string; original_r2_key: string}>();
    expect(retiredRow).toEqual({status: 'retired', original_r2_key: key});
    const attempt = await env.DB.prepare(
      'SELECT status FROM video_processing_attempts WHERE video_id = ?',
    )
      .bind(video.id)
      .first<{status: string}>();
    expect(attempt?.status).toBe('cancelled');

    const replacement = await createUpload(projectId, ownerToken, 7);
    expect(replacement.status).toBe(201);
    expect(replacement.body.upload.videoId).not.toBe(video.id);
    expect(replacement.body.upload.uploadId).not.toBe(video.id);

    const promoted = await api(`/projects/${projectId}/video/promote`, ownerToken, {
      method: 'POST',
      body: {sourceMediaId: 'attachment-id'},
    });
    expect(promoted.status).toBe(404);
  });

  it('normalizes browser MIME metadata while retaining video filename validation', async () => {
    const opaqueProject = await createProject('Opaque browser MIME');
    const opaque = await api(`/projects/${opaqueProject}/video/upload`, ownerToken, {
      method: 'POST',
      body: {
        fileName: 'camera-export.mp4',
        fileSize: 10,
        contentType: 'application/octet-stream',
      },
    });
    expect(opaque.status).toBe(201);
    expect(opaque.body.upload.contentType).toBeNull();
    await api(
      `/projects/${opaqueProject}/video/upload/${opaque.body.upload.uploadId}`,
      ownerToken,
      {
        method: 'DELETE',
      },
    );

    const parameterProject = await createProject('Parameterized browser MIME');
    const parameterized = await api(
      `/projects/${parameterProject}/video/upload`,
      ownerToken,
      {
        method: 'POST',
        body: {
          fileName: 'camera.mov',
          fileSize: 10,
          contentType: 'video/quicktime; codecs=hvc1',
        },
      },
    );
    expect(parameterized.status).toBe(201);
    expect(parameterized.body.upload.contentType).toBe('video/quicktime');
    await api(
      `/projects/${parameterProject}/video/upload/${parameterized.body.upload.uploadId}`,
      ownerToken,
      {method: 'DELETE'},
    );
  });

  it('rejects malformed, oversized, closed, idea, stale, and incomplete requests deterministically', async () => {
    const malformed = await api(`/projects/${projectId}/video/upload`, ownerToken, {
      method: 'POST',
      body: {fileName: 'notes.txt', fileSize: 10, contentType: 'text/plain'},
    });
    const oversized = await createUpload(projectId, ownerToken, MAX_VIDEO_BYTES + 1);
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(400);
    const maximumProject = await createProject('Maximum declaration');
    const maximum = await createUpload(maximumProject, ownerToken, MAX_VIDEO_BYTES);
    expect(maximum.status).toBe(201);
    await api(
      `/projects/${maximumProject}/video/upload/${maximum.body.upload.uploadId}`,
      ownerToken,
      {method: 'DELETE'},
    );

    const ideaId = `video-idea-${suffix}`;
    await env.DB.prepare(
      `INSERT INTO projects
        (id, source_id, year_id, creator_id, group_id, name, kind)
       VALUES (?, ?, ?, ?, ?, 'Video idea', 'idea')`,
    )
      .bind(ideaId, ideaId, yearId, ownerId, groupId)
      .run();
    expect((await createUpload(ideaId, ownerToken, 10)).status).toBe(400);

    await env.DB.prepare('UPDATE years SET submissions_closed = 1 WHERE id = ?')
      .bind(yearId)
      .run();
    expect((await createUpload(projectId, ownerToken, 10)).status).toBe(403);
    await env.DB.prepare('UPDATE years SET submissions_closed = 0 WHERE id = ?')
      .bind(yearId)
      .run();

    const created = await createUpload(projectId, ownerToken, 10);
    const uploadId = created.body.upload.uploadId as string;
    const incomplete = await api(
      `/projects/${projectId}/video/upload/${uploadId}/complete`,
      ownerToken,
      {method: 'POST', body: {parts: [{partNumber: 1, etag: 'missing'}]}},
    );
    expect(incomplete.status).toBe(400);

    await env.DB.prepare(
      `UPDATE video_uploads SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`,
    )
      .bind(uploadId)
      .run();
    const expired = await putPart(projectId, uploadId, 1, new Uint8Array(10), ownerToken);
    expect(expired.status).toBe(409);
    expect(expired.body.error.message).toBe('Upload session has expired');
  });

  it('allows aborting incomplete uploads idempotently but never completed objects', async () => {
    const created = await createUpload(projectId, ownerToken, 8);
    const uploadId = created.body.upload.uploadId as string;
    const first = await api(
      `/projects/${projectId}/video/upload/${uploadId}`,
      ownerToken,
      {method: 'DELETE'},
    );
    const duplicate = await api(
      `/projects/${projectId}/video/upload/${uploadId}`,
      ownerToken,
      {method: 'DELETE'},
    );
    expect(first.status).toBe(204);
    expect(duplicate.status).toBe(204);
  });

  it('conditionally publishes canonical metadata exactly once for the current attempt', async () => {
    const {video, key: originalKey} = await completeSmallUpload(
      projectId,
      ownerToken,
      'canonical source',
    );
    const claim = await claimVideoProcessingAttempt(env.DB, video.id, 1, 1);
    expect(claim.status).toBe('claimed');
    if (claim.status !== 'claimed') throw new Error('attempt was not claimed');
    expect(claim.outputKey).not.toBe(originalKey);

    expect(
      await publishVideoProcessingAttempt(
        env.DB,
        video.id,
        1,
        claim.outputKey,
        canonicalResult,
      ),
    ).toBe(true);
    expect(
      await publishVideoProcessingAttempt(
        env.DB,
        video.id,
        1,
        claim.outputKey,
        canonicalResult,
      ),
    ).toBe(false);
    const stored = await env.DB.prepare(
      `SELECT status, original_r2_key, processed_r2_key, duration_seconds,
        loudness_lufs, processing_attempt FROM video_submissions WHERE id = ?`,
    )
      .bind(video.id)
      .first();
    expect(stored).toEqual({
      status: 'ready',
      original_r2_key: originalKey,
      processed_r2_key: claim.outputKey,
      duration_seconds: canonicalResult.durationSeconds,
      loudness_lufs: canonicalResult.loudnessLufs,
      processing_attempt: 1,
    });
  });

  it('fences retirement, failure, retry, and late attempt completion while retaining bytes', async () => {
    const {video, key: originalKey} = await completeSmallUpload(
      projectId,
      ownerToken,
      'retry source',
    );
    const first = await claimVideoProcessingAttempt(env.DB, video.id, 1, 1);
    if (first.status !== 'claimed') throw new Error('attempt was not claimed');
    await env.VIDEOS.put(first.outputKey, 'retained stale derivative');
    expect(await failVideoProcessingAttempt(env.DB, video.id, 1, 'ffmpeg failed')).toBe(
      true,
    );

    const retried = await api(`/projects/${projectId}/video/retry`, ownerToken, {
      method: 'POST',
    });
    expect(retried.status).toBe(202);
    expect(retried.body.video).toMatchObject({status: 'queued', processingAttempt: 2});
    const second = await claimVideoProcessingAttempt(env.DB, video.id, 2, 1);
    if (second.status !== 'claimed') throw new Error('retry was not claimed');
    expect(second.outputKey).not.toBe(first.outputKey);
    expect(
      await publishVideoProcessingAttempt(
        env.DB,
        video.id,
        1,
        first.outputKey,
        canonicalResult,
      ),
    ).toBe(false);

    await env.VIDEOS.put(second.outputKey, 'retained current derivative');
    const retired = await api(`/projects/${projectId}/video`, ownerToken, {
      method: 'DELETE',
      body: {confirmed: true},
    });
    expect(retired.status).toBe(204);
    expect(
      await publishVideoProcessingAttempt(
        env.DB,
        video.id,
        2,
        second.outputKey,
        canonicalResult,
      ),
    ).toBe(false);
    expect(await env.VIDEOS.head(originalKey)).not.toBeNull();
    expect(await env.VIDEOS.head(first.outputKey)).not.toBeNull();
    expect(await env.VIDEOS.head(second.outputKey)).not.toBeNull();
  });

  it('serves authenticated canonical MP4 bytes with exact single-range semantics', async () => {
    const bytes = '0123456789';
    const ready = await publishReadyVideo(projectId, ownerToken, bytes);

    const unauthorizedDescriptor = await SELF.fetch(
      `${base}/videos/${ready.video.id}/playback`,
    );
    const unauthorizedContent = await SELF.fetch(
      `${base}/videos/${ready.video.id}/content`,
    );
    expect(unauthorizedDescriptor.status).toBe(401);
    expect(unauthorizedContent.status).toBe(401);

    const descriptor = await api(`/videos/${ready.video.id}/playback`, ownerToken);
    expect(descriptor.status).toBe(200);
    expect(descriptor.body).toEqual({
      source: {kind: 'mp4', url: `/api/videos/${ready.video.id}/content`},
      expiresAt: null,
    });
    expect(descriptor.headers.get('cache-control')).toBe('private, no-store');

    const full = await fetchVideoContent(ready.video.id, ownerToken);
    expect(full.status).toBe(200);
    expect(await responseText(full)).toBe(bytes);
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(full.headers.get('content-length')).toBe('10');
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect(full.headers.get('content-disposition')).toBe('inline');
    expect(full.headers.get('cache-control')).toBe('private, max-age=300');
    expect(full.headers.get('etag')).toBeTruthy();

    for (const [range, body, contentRange] of [
      ['bytes=2-5', '2345', 'bytes 2-5/10'],
      ['bytes=7-', '789', 'bytes 7-9/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=0-99', bytes, 'bytes 0-9/10'],
    ]) {
      const partial = await fetchVideoContent(ready.video.id, ownerToken, range);
      expect(partial.status, range).toBe(206);
      expect(await responseText(partial), range).toBe(body);
      expect(partial.headers.get('content-range'), range).toBe(contentRange);
      expect(partial.headers.get('content-length'), range).toBe(String(body.length));
      expect(partial.headers.get('accept-ranges'), range).toBe('bytes');
    }

    for (const range of [
      'bytes=10-',
      'bytes=5-2',
      'bytes=-0',
      'bytes=',
      'items=0-1',
      'bytes=0-1,3-4',
    ]) {
      const rejected = await fetchVideoContent(ready.video.id, ownerToken, range);
      expect(rejected.status, range).toBe(416);
      expect(rejected.headers.get('content-range'), range).toBe('bytes */10');
      expect(rejected.headers.get('accept-ranges'), range).toBe('bytes');
      expect(await responseText(rejected), range).toBe('');
    }
  });

  it('returns only ready active videos in curated order with team display names', async () => {
    const firstProject = await createProject('Curated first');
    const secondProject = await createProject('Curated second');
    const unreadyProject = await createProject('Curated unready');
    const first = await publishReadyVideo(firstProject, ownerToken, 'first canonical');
    const second = await publishReadyVideo(secondProject, ownerToken, 'second canonical');
    const unready = await completeSmallUpload(unreadyProject, ownerToken, 'not ready');
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
      ).bind(firstProject, memberId),
      env.DB.prepare(
        'INSERT INTO screening_order (year_id, project_id, position) VALUES (?, ?, 0)',
      ).bind(yearId, secondProject),
      env.DB.prepare(
        'INSERT INTO screening_order (year_id, project_id, position) VALUES (?, ?, 1)',
      ).bind(yearId, unreadyProject),
      env.DB.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').bind(ownerId),
    ]);

    const hiddenWhileOpen = await api(`/videos/playlist?year=${yearId}`, memberToken);
    expect(hiddenWhileOpen.status).toBe(403);

    const playlist = await api(`/videos/playlist?year=${yearId}`, ownerToken);
    expect(playlist.status).toBe(200);
    expect(playlist.body.videos.map((item: {videoId: string}) => item.videoId)).toEqual([
      second.video.id,
      first.video.id,
    ]);
    expect(playlist.body.videos[0]).toMatchObject({
      projectName: 'Curated second',
      groupName: 'Video group',
      position: 0,
      teamMembers: [{displayName: 'Hackweek Member'}],
    });
    expect(playlist.body.videos[1]).toMatchObject({
      projectName: 'Curated first',
      groupName: 'Video group',
      position: 1,
      teamMembers: [{displayName: 'Hackweek Member'}, {displayName: 'Hackweek Member'}],
    });
    expect(
      playlist.body.videos.some(
        (item: {videoId: string}) => item.videoId === unready.video.id,
      ),
    ).toBe(false);
    expect((await api(`/videos/${unready.video.id}/playback`, ownerToken)).status).toBe(
      409,
    );

    const retired = await api(`/projects/${secondProject}/video`, ownerToken, {
      method: 'DELETE',
      body: {confirmed: true},
    });
    expect(retired.status).toBe(204);
    expect(await env.VIDEOS.head(second.outputKey)).not.toBeNull();
    expect((await api(`/videos/${second.video.id}/playback`, ownerToken)).status).toBe(
      409,
    );
    const afterRetirement = await api(`/videos/playlist?year=${yearId}`, ownerToken);
    expect(
      afterRetirement.body.videos.map((item: {videoId: string}) => item.videoId),
    ).toEqual([first.video.id]);

    await env.DB.prepare('UPDATE years SET submissions_closed = 1 WHERE id = ?')
      .bind(yearId)
      .run();
    const memberArchive = await api(`/videos/playlist?year=${yearId}`, memberToken);
    expect(memberArchive.status).toBe(200);
    expect(memberArchive.body.videos).toHaveLength(1);
  });

  it('limits local processing to one while independent projects remain queued', async () => {
    const leftProject = await createProject('Processor left');
    const rightProject = await createProject('Processor right');
    const left = await completeSmallUpload(leftProject, ownerToken, 'left source');
    const right = await completeSmallUpload(rightProject, ownerToken, 'right source');

    const claimed = await claimVideoProcessingAttempt(env.DB, left.video.id, 1, 1);
    expect(claimed.status).toBe('claimed');
    await expect(
      claimVideoProcessingAttempt(env.DB, right.video.id, 1, 1),
    ).resolves.toEqual({status: 'capacity'});
    expect(
      await env.DB.prepare('SELECT status FROM video_submissions WHERE id = ?')
        .bind(right.video.id)
        .first('status'),
    ).toBe('queued');

    await failVideoProcessingAttempt(env.DB, left.video.id, 1, 'fixture release');
    expect(await claimVideoProcessingAttempt(env.DB, right.video.id, 1, 1)).toMatchObject(
      {
        status: 'claimed',
      },
    );
  });
});

const canonicalResult: VideoProcessorResult = {
  durationSeconds: 2,
  width: 1280,
  height: 720,
  videoCodec: 'h264',
  audioCodec: 'aac',
  pixelFormat: 'yuv420p',
  loudnessLufs: -16,
  loudnessTargetLufs: -16,
  loudnessToleranceLu: 0.7,
  audioMode: 'normalized',
  fastStart: true,
  sha256: 'a'.repeat(64),
};

async function publishReadyVideo(project: string, token: string, bytes: string) {
  const completed = await completeSmallUpload(project, token, bytes);
  const claim = await claimVideoProcessingAttempt(env.DB, completed.video.id, 1, 1);
  if (claim.status !== 'claimed') throw new Error('attempt was not claimed');
  await env.VIDEOS.put(claim.outputKey, bytes, {
    httpMetadata: {contentType: 'video/mp4'},
  });
  expect(
    await publishVideoProcessingAttempt(env.DB, completed.video.id, 1, claim.outputKey, {
      ...canonicalResult,
      durationSeconds: bytes.length,
    }),
  ).toBe(true);
  return {...completed, outputKey: claim.outputKey};
}

function fetchVideoContent(videoId: string, token: string, range?: string) {
  return SELF.fetch(`${base}/videos/${videoId}/content`, {
    headers: {Cookie: token, ...(range ? {Range: range} : {})},
  });
}

async function responseText(response: Response) {
  return new TextDecoder().decode(await response.arrayBuffer());
}

async function expireUpload(uploadId: string) {
  await env.DB.prepare(
    `UPDATE video_uploads SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`,
  )
    .bind(uploadId)
    .run();
}

async function uploadStorage(uploadId: string) {
  const upload = await env.DB.prepare(
    `SELECT original_r2_key, r2_upload_id FROM video_uploads WHERE id = ?`,
  )
    .bind(uploadId)
    .first<{original_r2_key: string; r2_upload_id: string}>();
  if (!upload) throw new Error('upload storage fixture is missing');
  return upload;
}

async function completeSmallUpload(project: string, token: string, bytes: string) {
  const created = await createUpload(project, token, bytes.length);
  expect(created.status).toBe(201);
  const uploadId = created.body.upload.uploadId as string;
  const part = await putPart(
    project,
    uploadId,
    1,
    new TextEncoder().encode(bytes),
    token,
  );
  expect(part.status).toBe(200);
  const completed = await api(
    `/projects/${project}/video/upload/${uploadId}/complete`,
    token,
    {
      method: 'POST',
      body: {
        parts: [{partNumber: 1, etag: part.body.part.etag}],
      },
    },
  );
  expect(completed.status).toBe(200);
  const stored = await env.DB.prepare(
    'SELECT original_r2_key FROM video_submissions WHERE id = ?',
  )
    .bind(completed.body.video.id)
    .first<{original_r2_key: string}>();
  return {video: completed.body.video, key: stored!.original_r2_key};
}

function createUpload(project: string, token: string, fileSize: number) {
  return api(`/projects/${project}/video/upload`, token, {
    method: 'POST',
    body: {fileName: 'demo.mp4', fileSize, contentType: 'video/mp4'},
  });
}

async function putPart(
  project: string,
  uploadId: string,
  partNumber: number,
  body: Uint8Array,
  token: string,
) {
  const response = await SELF.fetch(
    `${base}/projects/${project}/video/upload/${uploadId}/parts/${partNumber}`,
    {
      method: 'PUT',
      headers: {
        Cookie: token,
        Origin: 'https://hackweek.test',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(body.byteLength),
      },
      body: body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer,
    },
  );
  return parseResponse(response);
}

async function createProject(name: string) {
  const response = await api('/projects', ownerToken, {
    method: 'POST',
    body: projectPayload(name),
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.project.id as string;
}

function projectPayload(name: string): ProjectWriteRequest {
  return {
    yearId,
    name,
    summary: 'Project with a multipart R2 video.',
    repository: null,
    kind: 'project',
    groupId,
    memberIds: [],
    needsHelp: false,
    helpDetails: null,
  };
}

function session(token: string) {
  return SELF.fetch(`${base}/session`, {headers: {Cookie: token}});
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

async function parseResponse(response: Response) {
  const body = response.status === 204 ? null : await response.json<any>();
  return {status: response.status, body, headers: response.headers};
}
