import type {SessionUser} from '../../shared/api';
import type {
  PlaybackResponse,
  PlaylistItem,
  ProjectVideo,
  VideoProcessingStage,
  VideoUploadPart,
  VideoUploadSession,
} from '../../shared/videos';
import {
  currentYearIdSql,
  effectiveYearFlags,
  getEffectiveYearFlags,
} from '../repositories/years';
import type {VideoProcessingParams, VideoProcessorResult} from '../video-processing';
import {videoWorkflowInstanceId} from '../video-processing';
import {ServiceError} from './errors';

export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
export const VIDEO_PART_SIZE = 50 * 1024 * 1024;
export const UPLOAD_EXPIRY_MINUTES = 24 * 60;
const UPLOAD_COMPLETION_LEASE_MINUTES = 15;
const MAX_EXPIRED_UPLOAD_SWEEP = 100;

interface VideoRow {
  id: string;
  project_id: string;
  original_name: string;
  content_type: string | null;
  size_bytes: number;
  status: ProjectVideo['status'];
  processing_attempt: number;
  processed_r2_key: string | null;
  duration_seconds: number | null;
  loudness_lufs: number | null;
  gain_db: number | null;
  error_message: string | null;
  processing_stage: VideoProcessingStage | null;
  processing_progress: number | null;
  created_at: string;
}

interface ProcessingAttemptRow {
  video_id: string;
  project_id: string;
  original_r2_key: string;
  processing_attempt: number;
  video_status: string;
  attempt_status: string;
}

interface UploadRow {
  id: string;
  video_id: string;
  project_id: string;
  creator_id: string;
  r2_upload_id: string | null;
  original_r2_key: string;
  original_name: string;
  content_type: string | null;
  expected_size_bytes: number;
  part_size_bytes: number;
  status: VideoUploadSession['status'];
  expires_at: string;
}

interface ReapExpiredUploadOptions {
  projectId?: string;
  now?: Date;
  limit?: number;
}

interface ProjectAuthorizationRow {
  id: string;
  year_id: string;
  creator_id: string;
  kind: string;
  status: string;
  voting_enabled: number;
  submissions_closed: number;
  current_year_id: string;
  is_member: number;
}

export async function getProjectVideo(db: D1Database, projectId: string) {
  const row = await db
    .prepare(`${videoSelect()} WHERE project_id = ? AND retired_at IS NULL`)
    .bind(projectId)
    .first<VideoRow>();
  return row ? mapVideo(row) : null;
}

export async function listPlaylist(
  db: D1Database,
  yearId: string,
  user: SessionUser,
): Promise<PlaylistItem[]> {
  const year = await getEffectiveYearFlags(db, yearId);
  if (!year) throw new ServiceError('NOT_FOUND', 'Year not found', 404);
  if (!year.submissionsClosed && user.role !== 'admin') {
    throw new ServiceError(
      'AUTH_FORBIDDEN',
      'The screening reel is available after submissions close',
      403,
    );
  }

  const {results} = await db
    .prepare(
      `SELECT pv.id video_id, p.id project_id, p.name project_name,
        g.id group_id, g.name group_name, pv.duration_seconds, pv.gain_db, so.position
       FROM projects p
       JOIN video_submissions pv ON pv.project_id = p.id
       LEFT JOIN groups g ON g.id = p.group_id
       LEFT JOIN screening_order so ON so.project_id = p.id AND so.year_id = p.year_id
       WHERE p.year_id = ? AND p.status = 'active' AND p.kind = 'project'
         AND pv.status = 'ready' AND pv.retired_at IS NULL
         AND pv.processed_r2_key IS NOT NULL
         AND pv.duration_seconds IS NOT NULL AND pv.gain_db IS NOT NULL
       ORDER BY so.position IS NULL, so.position, p.name COLLATE NOCASE, p.id`,
    )
    .bind(yearId)
    .all<{
      video_id: string;
      project_id: string;
      project_name: string;
      group_id: string | null;
      group_name: string | null;
      duration_seconds: number;
      gain_db: number;
      position: number | null;
    }>();
  if (!results.length) return [];

  const membersByProject = new Map<string, Array<{id: string; displayName: string}>>();
  const members = await db
    .prepare(
      `SELECT pm.project_id, u.id user_id, u.display_name
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       JOIN projects p ON p.id = pm.project_id
       JOIN video_submissions pv ON pv.project_id = p.id
       WHERE p.year_id = ? AND p.status = 'active' AND p.kind = 'project'
         AND pv.status = 'ready' AND pv.retired_at IS NULL
         AND pv.processed_r2_key IS NOT NULL
         AND pv.duration_seconds IS NOT NULL AND pv.gain_db IS NOT NULL
       ORDER BY pm.project_id, u.display_name COLLATE NOCASE, u.id`,
    )
    .bind(yearId)
    .all<{project_id: string; user_id: string; display_name: string}>();
  for (const member of members.results) {
    const projectMembers = membersByProject.get(member.project_id) ?? [];
    projectMembers.push({id: member.user_id, displayName: member.display_name});
    membersByProject.set(member.project_id, projectMembers);
  }

  return results.map((row, position) => ({
    videoId: row.video_id,
    projectId: row.project_id,
    projectName: row.project_name,
    groupId: row.group_id,
    groupName: row.group_name,
    teamMembers: membersByProject.get(row.project_id) ?? [],
    durationSeconds: row.duration_seconds,
    gainDb: row.gain_db,
    position,
  }));
}

export async function issuePlayback(
  db: D1Database,
  videoId: string,
): Promise<PlaybackResponse> {
  await requireReadyVideo(db, videoId);
  return {
    source: {
      kind: 'mp4',
      url: `/api/videos/${encodeURIComponent(videoId)}/content`,
    },
    expiresAt: null,
  };
}

export async function getVideoContent(
  db: D1Database,
  bucket: R2Bucket,
  videoId: string,
  rangeHeader?: string,
) {
  const video = await requireReadyVideo(db, videoId);
  const key = video.processed_r2_key!;
  const head = await bucket.head(key);
  if (!head) throw new ServiceError('NOT_FOUND', 'Video content is missing', 404);

  const range =
    rangeHeader === undefined ? null : parseVideoRange(rangeHeader, head.size);
  const object = await bucket.get(
    key,
    range ? {range: {offset: range.start, length: range.length}} : undefined,
  );
  if (!object) throw new ServiceError('NOT_FOUND', 'Video content is missing', 404);
  return {object, range, size: head.size, etag: head.httpEtag};
}

export class VideoRangeError extends Error {
  constructor(readonly size: number) {
    super('Requested video range is not satisfiable');
  }
}

export function parseVideoRange(value: string, size: number) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new VideoRangeError(size);
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) throw new VideoRangeError(size);

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new VideoRangeError(size);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    ) {
      throw new VideoRangeError(size);
    }
    end = Math.min(end, size - 1);
  }
  return {start, end, length: end - start + 1};
}

export async function createMultipartVideoUpload(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  user: SessionUser,
  input: {fileName: string; fileSize: number; contentType: string | null},
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
  await reapExpiredMultipartVideoUploads(db, bucket, {projectId, now, limit: 1});
  const uploadId = crypto.randomUUID();
  const videoId = crypto.randomUUID();
  const originalKey = videoOriginalKey(projectId, videoId, input.fileName);
  const expiresAt = new Date(now.getTime() + UPLOAD_EXPIRY_MINUTES * 60_000);

  try {
    await db
      .prepare(
        `INSERT INTO video_uploads (
          id, video_id, project_id, creator_id, original_r2_key, original_name,
          content_type, expected_size_bytes, part_size_bytes, status, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?)`,
      )
      .bind(
        uploadId,
        videoId,
        projectId,
        user.id,
        originalKey,
        input.fileName,
        input.contentType,
        input.fileSize,
        VIDEO_PART_SIZE,
        expiresAt.toISOString(),
      )
      .run();
  } catch (error) {
    if (isVideoSlotConflict(error)) {
      throw new ServiceError(
        'CONFLICT',
        'This project already has an active video or upload',
        409,
      );
    }
    throw error;
  }

  try {
    const multipart = await bucket.createMultipartUpload(originalKey, {
      httpMetadata: {contentType: input.contentType || 'application/octet-stream'},
      customMetadata: {projectId, videoId, uploadId},
    });
    await db
      .prepare(
        `UPDATE video_uploads SET r2_upload_id = ?, status = 'uploading',
          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'creating'`,
      )
      .bind(multipart.uploadId, uploadId)
      .run();
  } catch {
    await db
      .prepare(
        `UPDATE video_uploads SET status = 'aborted', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'creating'`,
      )
      .bind(uploadId)
      .run();
    throw new ServiceError('STORAGE_FAILED', 'Video upload could not be started', 500);
  }

  return getVideoUpload(db, bucket, projectId, uploadId, user, now);
}

export async function reapExpiredMultipartVideoUploads(
  db: D1Database,
  bucket: R2Bucket,
  options: ReapExpiredUploadOptions = {},
) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? MAX_EXPIRED_UPLOAD_SWEEP;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EXPIRED_UPLOAD_SWEEP) {
    throw new Error(
      `Expired video upload sweep limit must be between 1 and ${MAX_EXPIRED_UPLOAD_SWEEP}`,
    );
  }

  const projectClause = options.projectId ? 'AND project_id = ?' : '';
  const bindings: Array<string | number> = [now.toISOString()];
  if (options.projectId) bindings.push(options.projectId);
  bindings.push(limit);
  const {results} = await db
    .prepare(
      `SELECT id, video_id, project_id, creator_id, r2_upload_id, original_r2_key,
        original_name, content_type, expected_size_bytes, part_size_bytes,
        status, expires_at
       FROM video_uploads
       WHERE (status = 'expiring' OR (
         status IN ('creating', 'uploading', 'completing') AND expires_at <= ?
       )) ${projectClause}
       ORDER BY expires_at, id LIMIT ?`,
    )
    .bind(...bindings)
    .all<UploadRow>();

  let reaped = 0;
  for (const upload of results) {
    if (await reapExpiredMultipartUpload(db, bucket, upload, now)) reaped += 1;
  }
  return reaped;
}

export async function getVideoUpload(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  uploadId: string,
  user: SessionUser,
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
  let upload = await requireUpload(db, projectId, uploadId);
  if (isExpired(upload, now) || upload.status === 'expiring') {
    await reapExpiredMultipartUpload(db, bucket, upload, now);
    upload = await requireUpload(db, projectId, uploadId);
  }
  const video =
    upload.status === 'completed' ? await requireVideoById(db, upload.video_id) : null;
  return {
    video: video ? mapVideo(video) : null,
    upload: await mapUpload(db, upload),
  };
}

export async function uploadVideoPart(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  uploadId: string,
  partNumber: number,
  contentLength: number,
  body: ReadableStream,
  user: SessionUser,
  now = new Date(),
): Promise<VideoUploadPart> {
  await authorizeVideoWrite(db, projectId, user);
  const upload = await requireUpload(db, projectId, uploadId);
  await assertUploadIsWritable(db, bucket, upload, now);
  if (upload.status !== 'uploading' || !upload.r2_upload_id) {
    throw new ServiceError('CONFLICT', 'Upload is not accepting parts', 409);
  }

  const expectedSize = expectedPartSize(upload, partNumber);
  if (expectedSize === null || contentLength !== expectedSize) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      `Part ${partNumber} must contain exactly ${expectedSize ?? 0} bytes`,
      400,
    );
  }

  const existing = await db
    .prepare(
      `SELECT part_number, etag, size_bytes FROM video_upload_parts
       WHERE upload_id = ? AND part_number = ?`,
    )
    .bind(upload.id, partNumber)
    .first<{part_number: number; etag: string; size_bytes: number}>();
  if (existing) return mapPart(existing);

  let uploaded: R2UploadedPart;
  try {
    uploaded = await bucket
      .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
      .uploadPart(partNumber, body);
  } catch {
    throw new ServiceError('STORAGE_FAILED', 'Video part upload failed', 500);
  }

  await db
    .prepare(
      `INSERT INTO video_upload_parts (upload_id, part_number, etag, size_bytes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(upload_id, part_number) DO UPDATE SET
         etag = excluded.etag, size_bytes = excluded.size_bytes`,
    )
    .bind(upload.id, uploaded.partNumber, uploaded.etag, contentLength)
    .run();
  return {partNumber: uploaded.partNumber, etag: uploaded.etag, sizeBytes: contentLength};
}

export async function completeVideoUpload(
  db: D1Database,
  bucket: R2Bucket,
  workflow: Workflow<VideoProcessingParams> | null,
  projectId: string,
  uploadId: string,
  suppliedParts: Array<{partNumber: number; etag: string}>,
  user: SessionUser,
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
  const upload = await requireUpload(db, projectId, uploadId);
  if (upload.status === 'completed') {
    const video = await requireVideoById(db, upload.video_id);
    if (workflow) {
      await ensureVideoProcessingWorkflow(workflow, video.id, video.processing_attempt);
    }
    return mapVideo(video);
  }
  await assertUploadIsWritable(db, bucket, upload, now);
  if (!upload.r2_upload_id || !['uploading', 'completing'].includes(upload.status)) {
    throw new ServiceError('CONFLICT', 'Upload cannot be completed', 409);
  }

  const storedParts = await listStoredParts(db, upload.id);
  validateCompletionParts(upload, storedParts, suppliedParts);

  const completionLease = new Date(
    now.getTime() + UPLOAD_COMPLETION_LEASE_MINUTES * 60_000,
  ).toISOString();
  const claimed = await db
    .prepare(
      `UPDATE video_uploads SET status = 'completing',
        expires_at = CASE WHEN expires_at < ? THEN ? ELSE expires_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('uploading', 'completing') AND expires_at > ?`,
    )
    .bind(completionLease, completionLease, upload.id, now.toISOString())
    .run();
  if (!claimed.meta.changes) {
    throw new ServiceError('CONFLICT', 'Upload completion was superseded', 409);
  }
  upload.status = 'completing';
  upload.expires_at =
    upload.expires_at < completionLease ? completionLease : upload.expires_at;

  let object = await bucket.head(upload.original_r2_key);
  if (!object) {
    try {
      object = await bucket
        .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
        .complete(storedParts.map(({partNumber, etag}) => ({partNumber, etag})));
    } catch {
      object = await bucket.head(upload.original_r2_key);
      if (!object) {
        await db
          .prepare(
            `UPDATE video_uploads SET status = 'uploading', updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'completing'`,
          )
          .bind(upload.id)
          .run();
        throw new ServiceError(
          'STORAGE_FAILED',
          'Video upload could not be completed',
          500,
        );
      }
    }
  }
  if (object.size !== upload.expected_size_bytes) {
    throw new ServiceError('STORAGE_FAILED', 'Completed video size does not match', 500);
  }

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE video_uploads SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'completing'`,
        )
        .bind(upload.id),
      db
        .prepare(
          `INSERT INTO video_submissions (
            id, project_id, original_name, content_type, size_bytes, original_r2_key,
            status, processing_attempt
          ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 1)`,
        )
        .bind(
          upload.video_id,
          upload.project_id,
          upload.original_name,
          upload.content_type,
          upload.expected_size_bytes,
          upload.original_r2_key,
        ),
      db
        .prepare(
          `INSERT INTO video_processing_attempts (video_id, attempt, status)
           VALUES (?, 1, 'queued')`,
        )
        .bind(upload.video_id),
    ]);
  } catch (error) {
    const existing = await db
      .prepare(`${videoSelect()} WHERE id = ?`)
      .bind(upload.video_id)
      .first<VideoRow>();
    if (!existing) throw error;
  }
  const video = await requireVideoById(db, upload.video_id);
  if (workflow) {
    await ensureVideoProcessingWorkflow(workflow, video.id, video.processing_attempt);
  }
  return mapVideo(video);
}

export async function abortVideoUpload(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  uploadId: string,
  user: SessionUser,
) {
  await authorizeVideoWrite(db, projectId, user);
  const upload = await requireUpload(db, projectId, uploadId);
  if (upload.status === 'aborted') return;
  if (upload.status === 'expired') return;
  if (upload.status === 'expiring') {
    await reapExpiredMultipartUpload(db, bucket, upload, new Date());
    return;
  }
  if (upload.status === 'completed') {
    throw new ServiceError('CONFLICT', 'Completed video objects cannot be aborted', 409);
  }
  if (upload.r2_upload_id) {
    try {
      await bucket
        .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
        .abort();
    } catch {
      throw new ServiceError('STORAGE_FAILED', 'Video upload could not be aborted', 500);
    }
  }
  await db
    .prepare(
      `UPDATE video_uploads SET status = 'aborted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('creating', 'uploading', 'completing')`,
    )
    .bind(upload.id)
    .run();
}

export async function retryProjectVideo(
  db: D1Database,
  workflow: Workflow<VideoProcessingParams> | null,
  projectId: string,
  user: SessionUser,
) {
  await authorizeVideoWrite(db, projectId, user);
  const video = await db
    .prepare(`${videoSelect()} WHERE project_id = ? AND retired_at IS NULL`)
    .bind(projectId)
    .first<VideoRow>();
  if (!video) throw new ServiceError('NOT_FOUND', 'Video not found', 404);
  if (video.status !== 'failed') {
    throw new ServiceError('CONFLICT', 'Only a failed video can be retried', 409);
  }
  const attempt = video.processing_attempt + 1;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE video_submissions SET status = 'queued', processing_attempt = ?,
          duration_seconds = NULL, loudness_lufs = NULL, gain_db = NULL,
          error_message = NULL, processed_r2_key = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND processing_attempt = ? AND status = 'failed'
           AND retired_at IS NULL`,
      )
      .bind(attempt, video.id, video.processing_attempt),
    db
      .prepare(
        `INSERT INTO video_processing_attempts (video_id, attempt, status)
         SELECT ?, ?, 'queued' WHERE EXISTS (
           SELECT 1 FROM video_submissions WHERE id = ?
             AND processing_attempt = ? AND status = 'queued' AND retired_at IS NULL
         )`,
      )
      .bind(video.id, attempt, video.id, attempt),
  ]);
  if (results.some((result) => result.meta.changes !== 1)) {
    throw new ServiceError('CONFLICT', 'Video retry was superseded', 409);
  }
  if (workflow) await ensureVideoProcessingWorkflow(workflow, video.id, attempt);
  return mapVideo(await requireVideoById(db, video.id));
}

export async function claimVideoProcessingAttempt(
  db: D1Database,
  videoId: string,
  attempt: number,
  concurrency: number,
): Promise<
  {status: 'claimed'; outputKey: string} | {status: 'stale'} | {status: 'capacity'}
> {
  const row = await processingAttempt(db, videoId, attempt);
  if (
    !row ||
    row.processing_attempt !== attempt ||
    row.video_status !== 'queued' ||
    row.attempt_status !== 'queued'
  ) {
    return {status: 'stale'};
  }
  const running = await db
    .prepare(
      `SELECT COUNT(*) count FROM video_processing_attempts WHERE status = 'running'`,
    )
    .first<{count: number}>();
  if ((running?.count ?? 0) >= concurrency) return {status: 'capacity'};
  const outputKey = videoProcessedKey(row.project_id, videoId, attempt);
  const results = await db.batch([
    db
      .prepare(
        `UPDATE video_processing_attempts
         SET status = 'running', output_r2_key = ?, started_at = CURRENT_TIMESTAMP,
           progress_stage = 'waiting_for_processor', progress_percent = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE video_id = ? AND attempt = ? AND status = 'queued'
           AND (SELECT COUNT(*) FROM video_processing_attempts WHERE status = 'running') < ?
           AND EXISTS (
             SELECT 1 FROM video_submissions WHERE id = ? AND processing_attempt = ?
               AND status = 'queued' AND retired_at IS NULL
           )`,
      )
      .bind(outputKey, videoId, attempt, concurrency, videoId, attempt),
    db
      .prepare(
        `UPDATE video_submissions SET status = 'processing', error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND processing_attempt = ? AND status = 'queued'
           AND retired_at IS NULL AND EXISTS (
             SELECT 1 FROM video_processing_attempts
             WHERE video_id = ? AND attempt = ? AND status = 'running'
               AND output_r2_key = ?
           )`,
      )
      .bind(videoId, attempt, videoId, attempt, outputKey),
  ]);
  if (results.every((result) => result.meta.changes === 1)) {
    return {status: 'claimed', outputKey};
  }
  const current = await processingAttempt(db, videoId, attempt);
  if (current?.video_status === 'queued' && current.attempt_status === 'queued') {
    return {status: 'capacity'};
  }
  return {status: 'stale'};
}

export async function reportVideoProcessingProgress(
  db: D1Database,
  videoId: string,
  attempt: number,
  stage: VideoProcessingStage,
  progress: number | null,
) {
  const result = await db
    .prepare(
      `UPDATE video_processing_attempts
       SET progress_stage = ?, progress_percent = ?, updated_at = CURRENT_TIMESTAMP
       WHERE video_id = ? AND attempt = ? AND status = 'running'
         AND EXISTS (
           SELECT 1 FROM video_submissions
           WHERE id = ? AND processing_attempt = ? AND status = 'processing'
             AND retired_at IS NULL
         )`,
    )
    .bind(stage, progress, videoId, attempt, videoId, attempt)
    .run();
  return result.meta.changes === 1;
}

export async function publishVideoProcessingAttempt(
  db: D1Database,
  videoId: string,
  attempt: number,
  outputKey: string,
  result: VideoProcessorResult,
) {
  const updates = await db.batch([
    db
      .prepare(
        `UPDATE video_submissions SET status = 'ready', processed_r2_key = ?,
          duration_seconds = ?, loudness_lufs = ?, gain_db = 0,
          error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND processing_attempt = ? AND status = 'processing'
           AND retired_at IS NULL AND processed_r2_key IS NULL
           AND EXISTS (
             SELECT 1 FROM video_processing_attempts
             WHERE video_id = ? AND attempt = ? AND status = 'running'
               AND output_r2_key = ?
           )`,
      )
      .bind(
        outputKey,
        result.durationSeconds,
        result.loudnessLufs,
        videoId,
        attempt,
        videoId,
        attempt,
        outputKey,
      ),
    db
      .prepare(
        `UPDATE video_processing_attempts SET status = 'succeeded',
          finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE video_id = ? AND attempt = ? AND status = 'running'
           AND output_r2_key = ? AND EXISTS (
             SELECT 1 FROM video_submissions WHERE id = ? AND processing_attempt = ?
               AND status = 'ready' AND retired_at IS NULL AND processed_r2_key = ?
           )`,
      )
      .bind(videoId, attempt, outputKey, videoId, attempt, outputKey),
  ]);
  return updates.every((update) => update.meta.changes === 1);
}

export async function failVideoProcessingAttempt(
  db: D1Database,
  videoId: string,
  attempt: number,
  error: string,
) {
  const message = boundedProcessingError(error);
  const updates = await db.batch([
    db
      .prepare(
        `UPDATE video_submissions SET status = 'failed', error_message = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND processing_attempt = ? AND retired_at IS NULL
           AND status IN ('queued', 'processing')
           AND EXISTS (
             SELECT 1 FROM video_processing_attempts
             WHERE video_id = ? AND attempt = ? AND status IN ('queued', 'running')
           )`,
      )
      .bind(message, videoId, attempt, videoId, attempt),
    db
      .prepare(
        `UPDATE video_processing_attempts SET status = 'failed', error_message = ?,
          finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE video_id = ? AND attempt = ? AND status IN ('queued', 'running')
           AND EXISTS (
             SELECT 1 FROM video_submissions WHERE id = ? AND processing_attempt = ?
               AND status = 'failed' AND retired_at IS NULL
           )`,
      )
      .bind(message, videoId, attempt, videoId, attempt),
  ]);
  return updates.every((update) => update.meta.changes === 1);
}

export async function retireProjectVideo(
  db: D1Database,
  projectId: string,
  user: SessionUser,
  confirmed: boolean,
) {
  if (!confirmed) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'Video retirement must be confirmed',
      400,
    );
  }
  await authorizeVideoWrite(db, projectId, user);
  const video = await db
    .prepare(`${videoSelect()} WHERE project_id = ? AND retired_at IS NULL`)
    .bind(projectId)
    .first<VideoRow>();
  if (!video) throw new ServiceError('NOT_FOUND', 'Video not found', 404);
  await db.batch([
    db
      .prepare(
        `UPDATE video_submissions SET status = 'retired', retired_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND retired_at IS NULL`,
      )
      .bind(video.id),
    db
      .prepare(
        `UPDATE video_processing_attempts SET status = 'cancelled',
          finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE video_id = ? AND status IN ('queued', 'running')`,
      )
      .bind(video.id),
  ]);
}

async function assertUploadIsWritable(
  db: D1Database,
  bucket: R2Bucket,
  upload: UploadRow,
  now: Date,
) {
  if (isExpired(upload, now) || upload.status === 'expiring') {
    await reapExpiredMultipartUpload(db, bucket, upload, now);
    throw new ServiceError('CONFLICT', 'Upload session has expired', 409);
  }
  if (upload.status === 'aborted' || upload.status === 'expired') {
    throw new ServiceError('CONFLICT', 'Upload session is no longer active', 409);
  }
}

async function reapExpiredMultipartUpload(
  db: D1Database,
  bucket: R2Bucket,
  upload: UploadRow,
  now: Date,
) {
  if (upload.status !== 'expiring') {
    const fenced = await db
      .prepare(
        `UPDATE video_uploads SET status = 'expiring', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND project_id = ? AND video_id = ? AND original_r2_key = ?
           AND status = ? AND expires_at = ? AND expires_at <= ?
           AND (r2_upload_id = ? OR (r2_upload_id IS NULL AND ? IS NULL))`,
      )
      .bind(
        upload.id,
        upload.project_id,
        upload.video_id,
        upload.original_r2_key,
        upload.status,
        upload.expires_at,
        now.toISOString(),
        upload.r2_upload_id,
        upload.r2_upload_id,
      )
      .run();
    if (!fenced.meta.changes) return false;
    upload.status = 'expiring';
  }

  if (upload.r2_upload_id) {
    try {
      await bucket
        .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
        .abort();
    } catch (error) {
      if (!isMissingMultipartUpload(error)) throw uploadCleanupUnavailable();
    }

    let completedObject: R2Object | null;
    try {
      completedObject = await bucket.head(upload.original_r2_key);
    } catch {
      throw uploadCleanupUnavailable();
    }
    if (completedObject) {
      throw new ServiceError(
        'CONFLICT',
        'Video upload completed while expiration cleanup was running',
        409,
      );
    }
  }

  const expired = await db
    .prepare(
      `UPDATE video_uploads SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ? AND video_id = ? AND status = 'expiring'
         AND original_r2_key = ?
         AND (r2_upload_id = ? OR (r2_upload_id IS NULL AND ? IS NULL))`,
    )
    .bind(
      upload.id,
      upload.project_id,
      upload.video_id,
      upload.original_r2_key,
      upload.r2_upload_id,
      upload.r2_upload_id,
    )
    .run();
  return expired.meta.changes === 1;
}

function uploadCleanupUnavailable() {
  return new ServiceError(
    'SERVICE_UNAVAILABLE',
    'Expired video upload cleanup could not confirm storage abort; retry the upload request',
    503,
  );
}

function isMissingMultipartUpload(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return (
    message.includes('(10024)') ||
    message.includes('The specified multipart upload does not exist')
  );
}

async function authorizeVideoWrite(db: D1Database, projectId: string, user: SessionUser) {
  const project = await db
    .prepare(
      `SELECT p.id, p.year_id, p.creator_id, p.kind, p.status,
        y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id,
        EXISTS(SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = ?) is_member
       FROM projects p JOIN years y ON y.id = p.year_id WHERE p.id = ?`,
    )
    .bind(user.id, projectId)
    .first<ProjectAuthorizationRow>();
  if (!project || project.status !== 'active') {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  if (project.kind !== 'project') {
    throw new ServiceError('VALIDATION_FAILED', 'Ideas cannot have project videos', 400);
  }
  if (effectiveYearFlags(project.year_id, project).submissionsClosed) {
    throw new ServiceError('AUTH_FORBIDDEN', 'Submissions are closed', 403);
  }
  if (user.role !== 'admin' && project.creator_id !== user.id && !project.is_member) {
    throw new ServiceError(
      'AUTH_FORBIDDEN',
      'Project membership or creator permission is required',
      403,
    );
  }
}

async function requireUpload(db: D1Database, projectId: string, uploadId: string) {
  const upload = await db
    .prepare(
      `SELECT id, video_id, project_id, creator_id, r2_upload_id, original_r2_key,
        original_name, content_type, expected_size_bytes, part_size_bytes,
        status, expires_at
       FROM video_uploads WHERE id = ? AND project_id = ?`,
    )
    .bind(uploadId, projectId)
    .first<UploadRow>();
  if (!upload) throw new ServiceError('NOT_FOUND', 'Video upload not found', 404);
  return upload;
}

async function requireVideoById(db: D1Database, videoId: string) {
  const video = await db
    .prepare(`${videoSelect()} WHERE id = ?`)
    .bind(videoId)
    .first<VideoRow>();
  if (!video) throw new ServiceError('NOT_FOUND', 'Video not found', 404);
  return video;
}

async function mapUpload(db: D1Database, upload: UploadRow): Promise<VideoUploadSession> {
  return {
    uploadId: upload.id,
    videoId: upload.video_id,
    projectId: upload.project_id,
    fileName: upload.original_name,
    contentType: upload.content_type,
    fileSize: upload.expected_size_bytes,
    partSize: upload.part_size_bytes,
    expiresAt: upload.expires_at,
    status: upload.status,
    completedParts: await listStoredParts(db, upload.id),
  };
}

function mapVideo(row: VideoRow): ProjectVideo {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    loudnessLufs: row.loudness_lufs,
    gainDb: row.gain_db,
    errorMessage: row.error_message,
    failureStage: row.status === 'failed' ? 'processing' : null,
    processingAttempt: row.processing_attempt,
    processingStage: row.status === 'processing' ? row.processing_stage : null,
    processingProgress: row.status === 'processing' ? row.processing_progress : null,
    createdAt: row.created_at,
  };
}

function videoSelect() {
  return `SELECT id, project_id, original_name, content_type, size_bytes, status,
    processing_attempt, processed_r2_key, duration_seconds, loudness_lufs, gain_db,
    error_message,
    (SELECT progress_stage FROM video_processing_attempts
      WHERE video_id = video_submissions.id
        AND attempt = video_submissions.processing_attempt) processing_stage,
    (SELECT progress_percent FROM video_processing_attempts
      WHERE video_id = video_submissions.id
        AND attempt = video_submissions.processing_attempt) processing_progress,
    created_at FROM video_submissions`;
}

async function requireReadyVideo(db: D1Database, videoId: string) {
  const video = await db
    .prepare(
      `${videoSelect()} WHERE id = ? AND status = 'ready' AND retired_at IS NULL
        AND processed_r2_key IS NOT NULL`,
    )
    .bind(videoId)
    .first<VideoRow>();
  if (!video) {
    throw new ServiceError('CONFLICT', 'Video is not ready for playback', 409);
  }
  return video;
}

async function listStoredParts(db: D1Database, uploadId: string) {
  const {results} = await db
    .prepare(
      `SELECT part_number, etag, size_bytes FROM video_upload_parts
       WHERE upload_id = ? ORDER BY part_number`,
    )
    .bind(uploadId)
    .all<{part_number: number; etag: string; size_bytes: number}>();
  return results.map(mapPart);
}

function mapPart(row: {part_number: number; etag: string; size_bytes: number}) {
  return {partNumber: row.part_number, etag: row.etag, sizeBytes: row.size_bytes};
}

function validateCompletionParts(
  upload: UploadRow,
  stored: VideoUploadPart[],
  supplied: Array<{partNumber: number; etag: string}>,
) {
  const count = Math.ceil(upload.expected_size_bytes / upload.part_size_bytes);
  if (stored.length !== count || supplied.length !== count) {
    throw new ServiceError('VALIDATION_FAILED', 'Every video part must be uploaded', 400);
  }
  for (let index = 0; index < count; index += 1) {
    const expectedNumber = index + 1;
    const saved = stored[index];
    const provided = supplied[index];
    if (
      saved.partNumber !== expectedNumber ||
      provided?.partNumber !== expectedNumber ||
      provided.etag !== saved.etag ||
      saved.sizeBytes !== expectedPartSize(upload, expectedNumber)
    ) {
      throw new ServiceError(
        'VALIDATION_FAILED',
        'Completed video parts are invalid',
        400,
      );
    }
  }
}

function expectedPartSize(upload: UploadRow, partNumber: number) {
  const count = Math.ceil(upload.expected_size_bytes / upload.part_size_bytes);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count) return null;
  if (partNumber < count) return upload.part_size_bytes;
  return upload.expected_size_bytes - upload.part_size_bytes * (count - 1);
}

function isExpired(upload: UploadRow, now: Date) {
  return (
    ['creating', 'uploading', 'completing'].includes(upload.status) &&
    Date.parse(upload.expires_at) <= now.getTime()
  );
}

function isVideoSlotConflict(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return (
    message.includes('video_uploads_active_project_idx') ||
    message.includes('active project video exists') ||
    message.includes('UNIQUE constraint failed: video_uploads.project_id')
  );
}

async function processingAttempt(db: D1Database, videoId: string, attempt: number) {
  return db
    .prepare(
      `SELECT pv.id video_id, pv.project_id, pv.original_r2_key,
        pv.processing_attempt, pv.status video_status, vpa.status attempt_status
       FROM video_submissions pv
       JOIN video_processing_attempts vpa
         ON vpa.video_id = pv.id AND vpa.attempt = ?
       WHERE pv.id = ?`,
    )
    .bind(attempt, videoId)
    .first<ProcessingAttemptRow>();
}

async function ensureVideoProcessingWorkflow(
  workflow: Workflow<VideoProcessingParams>,
  videoId: string,
  attempt: number,
) {
  const id = videoWorkflowInstanceId(videoId, attempt);
  try {
    await workflow.create({
      id,
      params: {videoId, attempt},
      retention: {successRetention: '30 days', errorRetention: '30 days'},
    });
  } catch (error) {
    try {
      const existing = await workflow.get(id);
      const status = await existing.status();
      if (status.status !== 'unknown') return;
    } catch {
      // Preserve the original create failure when no deterministic instance exists.
    }
    throw error;
  }
}

function boundedProcessingError(error: string) {
  const normalized = error.replace(/\s+/g, ' ').trim();
  return (normalized || 'Video processing failed').slice(0, 500);
}

function videoProcessedKey(projectId: string, videoId: string, attempt: number) {
  return `projects/${encodeURIComponent(projectId)}/videos/${videoId}/processed/attempt-${attempt}.mp4`;
}

function videoOriginalKey(projectId: string, videoId: string, fileName: string) {
  const safeName = fileName
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `projects/${encodeURIComponent(projectId)}/videos/${videoId}/original/${safeName || 'video'}`;
}
