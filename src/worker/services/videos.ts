import type {SessionUser} from '../../shared/api';
import type {
  ProjectVideo,
  VideoUploadPart,
  VideoUploadSession,
} from '../../shared/videos';
import {currentYearIdSql, effectiveYearFlags} from '../repositories/years';
import {ServiceError} from './errors';

export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
export const VIDEO_PART_SIZE = 50 * 1024 * 1024;
export const UPLOAD_EXPIRY_MINUTES = 24 * 60;

interface VideoRow {
  id: string;
  project_id: string;
  original_name: string;
  content_type: string | null;
  size_bytes: number;
  status: string;
  processing_attempt: number;
  duration_seconds: number | null;
  loudness_lufs: number | null;
  gain_db: number | null;
  error_message: string | null;
  created_at: string;
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

export async function createMultipartVideoUpload(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  user: SessionUser,
  input: {fileName: string; fileSize: number; contentType: string | null},
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
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

export async function getVideoUpload(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  uploadId: string,
  user: SessionUser,
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
  const upload = await requireUpload(db, projectId, uploadId);
  if (isExpired(upload, now)) {
    if (upload.r2_upload_id) {
      await bucket
        .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
        .abort()
        .catch(() => undefined);
    }
    await markExpired(db, upload.id);
    upload.status = 'expired';
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
  projectId: string,
  uploadId: string,
  suppliedParts: Array<{partNumber: number; etag: string}>,
  user: SessionUser,
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
  const upload = await requireUpload(db, projectId, uploadId);
  if (upload.status === 'completed') {
    return mapVideo(await requireVideoById(db, upload.video_id));
  }
  await assertUploadIsWritable(db, bucket, upload, now);
  if (!upload.r2_upload_id || !['uploading', 'completing'].includes(upload.status)) {
    throw new ServiceError('CONFLICT', 'Upload cannot be completed', 409);
  }

  const storedParts = await listStoredParts(db, upload.id);
  validateCompletionParts(upload, storedParts, suppliedParts);

  if (upload.status === 'uploading') {
    const claimed = await db
      .prepare(
        `UPDATE video_uploads SET status = 'completing', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'uploading'`,
      )
      .bind(upload.id)
      .run();
    if (!claimed.meta.changes) {
      throw new ServiceError('CONFLICT', 'Upload completion is already in progress', 409);
    }
    upload.status = 'completing';
  }

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
          `INSERT INTO project_videos (
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
  return mapVideo(await requireVideoById(db, upload.video_id));
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
  if (upload.status === 'expired') {
    if (upload.r2_upload_id) {
      await bucket
        .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
        .abort()
        .catch(() => undefined);
    }
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
        `UPDATE project_videos SET status = 'retired', retired_at = CURRENT_TIMESTAMP,
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
  if (isExpired(upload, now)) {
    if (upload.r2_upload_id) {
      await bucket
        .resumeMultipartUpload(upload.original_r2_key, upload.r2_upload_id)
        .abort()
        .catch(() => undefined);
    }
    await markExpired(db, upload.id);
    throw new ServiceError('CONFLICT', 'Upload session has expired', 409);
  }
  if (upload.status === 'aborted' || upload.status === 'expired') {
    throw new ServiceError('CONFLICT', 'Upload session is no longer active', 409);
  }
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
    status: row.status as ProjectVideo['status'],
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    loudnessLufs: row.loudness_lufs,
    gainDb: row.gain_db,
    errorMessage: row.error_message,
    failureStage: row.status === 'failed' ? 'processing' : null,
    processingAttempt: row.processing_attempt,
    createdAt: row.created_at,
  };
}

function videoSelect() {
  return `SELECT id, project_id, original_name, content_type, size_bytes, status,
    processing_attempt, duration_seconds, loudness_lufs, gain_db, error_message,
    created_at FROM project_videos`;
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

function markExpired(db: D1Database, uploadId: string) {
  return db
    .prepare(
      `UPDATE video_uploads SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('creating', 'uploading', 'completing')`,
    )
    .bind(uploadId)
    .run();
}

function isVideoSlotConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('video_uploads_active_project_idx') ||
    message.includes('active project video exists') ||
    message.includes('UNIQUE constraint failed: video_uploads.project_id')
  );
}

function videoOriginalKey(projectId: string, videoId: string, fileName: string) {
  const safeName = fileName
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `projects/${encodeURIComponent(projectId)}/videos/${videoId}/original/${safeName || 'video'}`;
}
