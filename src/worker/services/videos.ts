import type {SessionUser} from '../../shared/api';
import type {
  ArchiveQueueItem,
  ArchiveStatus,
  MeasurementQueueItem,
  PlaylistItem,
  ProjectVideo,
  VideoFailureStage,
  VideoStatus,
} from '../../shared/videos';
import type {HistoricalVideoSource} from '../integrations/historical-source';
import type {StreamGateway} from '../integrations/stream';
import {ServiceError} from './errors';

export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 10 * 60;
export const TUS_CHUNK_SIZE = 50 * 1024 * 1024;
export const UPLOAD_EXPIRY_MINUTES = 30;
export const PLAYBACK_EXPIRY_MINUTES = 15;
export const SERVICE_DOWNLOAD_EXPIRY_MINUTES = 15;

interface VideoRow {
  id: string;
  project_id: string;
  stream_uid: string | null;
  source_media_id: string | null;
  status: string;
  duration_seconds: number | null;
  loudness_lufs: number | null;
  gain_db: number | null;
  error_message: string | null;
  failure_stage: string | null;
  archive_status: string;
  archive_error: string | null;
}

interface ProjectAuthorizationRow {
  id: string;
  name: string;
  creator_id: string;
  kind: string;
  status: string;
  is_member: number;
}

export async function getProjectVideo(db: D1Database, projectId: string) {
  const row = await videoByProject(db, projectId);
  return row ? mapVideo(row) : null;
}

export async function createDirectUpload(
  db: D1Database,
  gateway: StreamGateway,
  projectId: string,
  user: SessionUser,
  input: {fileName: string; fileSize: number},
  allowedOrigin: string,
  now = new Date(),
) {
  await authorizeVideoWrite(db, projectId, user);
  const existing = await videoByProject(db, projectId);
  if (existing && !(await canReplaceUpload(db, existing, now))) {
    throw new ServiceError(
      'CONFLICT',
      'The primary video must fail, expire, or be deleted before it can be replaced',
      409,
    );
  }

  const expiresAt = new Date(now.getTime() + UPLOAD_EXPIRY_MINUTES * 60_000);
  const upload = await gateway.createDirectUpload({
    creator: user.id,
    fileName: input.fileName,
    fileSize: input.fileSize,
    maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
    allowedOrigin,
    expiresAt,
  });
  const id = existing?.id ?? crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO project_videos
          (id, project_id, stream_uid, status, upload_expires_at,
           error_message, failure_stage, duration_seconds, loudness_lufs, gain_db,
           archive_status, archive_error)
         VALUES (?, ?, ?, 'uploading', ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL)
         ON CONFLICT(project_id) DO UPDATE SET
           stream_uid = excluded.stream_uid, source_media_id = NULL, status = 'uploading',
           upload_expires_at = excluded.upload_expires_at, duration_seconds = NULL,
           loudness_lufs = NULL, gain_db = NULL,
           error_message = NULL, failure_stage = NULL, archive_status = 'pending',
           archive_error = NULL, archived_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(id, projectId, upload.uid, expiresAt.toISOString())
      .run();
  } catch (error) {
    await gateway.deleteVideo(upload.uid).catch(() => undefined);
    throw error;
  }
  const row = await requireVideoById(db, id);
  return {video: mapVideo(row), upload};
}

export async function promoteHistoricalVideo(
  db: D1Database,
  gateway: StreamGateway,
  historicalSource: HistoricalVideoSource,
  projectId: string,
  sourceMediaId: string,
  user: SessionUser,
  allowedOrigin: string,
) {
  await authorizeVideoWrite(db, projectId, user);
  const existing = await videoByProject(db, projectId);
  if (existing && !canReplace(existing.status)) {
    throw new ServiceError('CONFLICT', 'This project already has a primary video', 409);
  }
  const media = await db
    .prepare(
      `SELECT id, original_name, r2_key, media_type, status
       FROM media WHERE id = ? AND project_id = ?`,
    )
    .bind(sourceMediaId, projectId)
    .first<{
      id: string;
      original_name: string;
      r2_key: string;
      media_type: string | null;
      status: string;
    }>();
  if (!media || media.status !== 'available' || !media.media_type?.startsWith('video/')) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      'Historical promotion requires an available video attachment from this project',
      400,
    );
  }
  const sourceUrl = await historicalSource.createReadUrl(media.r2_key, 15 * 60);
  const streamUid = await gateway.promoteHistoricalVideo({
    creator: user.id,
    sourceUrl,
    fileName: media.original_name,
    allowedOrigin,
  });
  const id = existing?.id ?? crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO project_videos
          (id, project_id, stream_uid, source_media_id, status, archive_status)
         VALUES (?, ?, ?, ?, 'processing', 'pending')
         ON CONFLICT(project_id) DO UPDATE SET
           stream_uid = excluded.stream_uid, source_media_id = excluded.source_media_id,
           status = 'processing', upload_expires_at = NULL, duration_seconds = NULL,
           gain_db = NULL, error_message = NULL, failure_stage = NULL,
           archive_status = 'pending', archive_error = NULL, archived_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(id, projectId, streamUid, media.id)
      .run();
  } catch (error) {
    await gateway.deleteVideo(streamUid).catch(() => undefined);
    throw error;
  }
  return mapVideo(await requireVideoById(db, id));
}

export async function deleteProjectVideo(
  db: D1Database,
  gateway: StreamGateway,
  projectId: string,
  user: SessionUser,
) {
  await authorizeVideoWrite(db, projectId, user);
  const video = await videoByProject(db, projectId);
  if (!video) throw new ServiceError('NOT_FOUND', 'Video not found', 404);
  if (video.stream_uid) await gateway.deleteVideo(video.stream_uid);
  await db.prepare('DELETE FROM project_videos WHERE id = ?').bind(video.id).run();
}

export async function processStreamWebhook(
  db: D1Database,
  event: {
    eventId: string;
    streamUid: string;
    eventType: string;
    ready: boolean;
    durationSeconds: number | null;
    errorMessage: string | null;
  },
) {
  const video = await db
    .prepare(`${videoSelect()} WHERE stream_uid = ?`)
    .bind(event.streamUid)
    .first<VideoRow>();
  if (!video) return {handled: false, duplicate: false};

  const status: VideoStatus = event.ready ? 'measuring' : 'failed';
  const failureStage: VideoFailureStage | null = event.ready ? null : 'stream';
  const inserted = await db
    .prepare(
      `INSERT INTO stream_events (event_id, stream_uid, event_type)
       VALUES (?, ?, ?) ON CONFLICT(event_id) DO NOTHING`,
    )
    .bind(event.eventId, event.streamUid, event.eventType)
    .run();
  if (!inserted.meta.changes) return {handled: true, duplicate: true};
  try {
    await db
      .prepare(
        `UPDATE project_videos SET status = ?, duration_seconds = COALESCE(?, duration_seconds),
          error_message = ?, failure_stage = ?, upload_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(
        status,
        event.durationSeconds,
        event.ready ? null : event.errorMessage || 'Stream processing failed',
        failureStage,
        video.id,
      )
      .run();
  } catch (error) {
    await db
      .prepare('DELETE FROM stream_events WHERE event_id = ?')
      .bind(event.eventId)
      .run();
    throw error;
  }
  return {handled: true, duplicate: false};
}

export async function listPlaylist(db: D1Database, yearId: string) {
  const {results} = await db
    .prepare(
      `SELECT pv.id video_id, p.id project_id, p.name project_name,
        pv.duration_seconds, pv.gain_db, so.position
       FROM screening_order so
       JOIN projects p ON p.id = so.project_id AND p.status = 'active'
       JOIN project_videos pv ON pv.project_id = p.id
       WHERE so.year_id = ? AND pv.status = 'ready'
         AND pv.duration_seconds IS NOT NULL AND pv.gain_db IS NOT NULL
       ORDER BY so.position, p.id`,
    )
    .bind(yearId)
    .all<{
      video_id: string;
      project_id: string;
      project_name: string;
      duration_seconds: number;
      gain_db: number;
      position: number;
    }>();
  return results.map<PlaylistItem>((row) => ({
    videoId: row.video_id,
    projectId: row.project_id,
    projectName: row.project_name,
    durationSeconds: row.duration_seconds,
    gainDb: row.gain_db,
    position: row.position,
  }));
}

export async function issuePlayback(
  db: D1Database,
  gateway: StreamGateway,
  videoId: string,
  deliveryHost: string,
  now = new Date(),
) {
  const video = await requireVideoById(db, videoId);
  if (video.status !== 'ready' || !video.stream_uid) {
    throw new ServiceError('CONFLICT', 'Video is not ready for playback', 409);
  }
  const expiresAt = new Date(now.getTime() + PLAYBACK_EXPIRY_MINUTES * 60_000);
  const token = await gateway.createPlaybackToken(video.stream_uid, expiresAt);
  return {
    mode: token.startsWith('fake.') ? ('fake' as const) : ('stream' as const),
    manifestUrl: token.startsWith('fake.')
      ? null
      : `https://${deliveryHost}/${encodeURIComponent(token)}/manifest/video.m3u8`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function listMeasurementQueue(
  db: D1Database,
  gateway: StreamGateway,
  deliveryHost: string,
  now = new Date(),
) {
  const {results} = await db
    .prepare(
      `${videoSelect()} WHERE status = 'measuring' ORDER BY updated_at, id LIMIT 20`,
    )
    .all<VideoRow>();
  const queue: MeasurementQueueItem[] = [];
  for (const video of results) {
    if (!video.stream_uid) continue;
    const download = await gateway.ensureDownload(video.stream_uid);
    if (download.status === 'error') {
      await markMeasurementFailure(db, video.id, 'Stream MP4 generation failed');
      continue;
    }
    if (download.status !== 'ready') continue;
    const expiresAt = new Date(now.getTime() + SERVICE_DOWNLOAD_EXPIRY_MINUTES * 60_000);
    const token = await gateway.createDownloadToken(video.stream_uid, expiresAt);
    queue.push({
      videoId: video.id,
      projectId: video.project_id,
      downloadUrl: token.startsWith('fake.')
        ? download.url!
        : `https://${deliveryHost}/${encodeURIComponent(token)}/downloads/default.mp4`,
    });
  }
  return queue;
}

export async function recordMeasurement(
  db: D1Database,
  videoId: string,
  input: {loudnessLufs: number; durationSeconds: number},
) {
  const result = await db
    .prepare(
      `UPDATE project_videos SET status = 'ready', duration_seconds = ?,
        loudness_lufs = ?, gain_db = ?, error_message = NULL, failure_stage = NULL,
        measurement_attempts = measurement_attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'measuring'`,
    )
    .bind(
      input.durationSeconds,
      input.loudnessLufs,
      loudnessGain(input.loudnessLufs),
      videoId,
    )
    .run();
  if (!result.meta.changes) {
    throw new ServiceError('CONFLICT', 'Video is not awaiting measurement', 409);
  }
  return mapVideo(await requireVideoById(db, videoId));
}

export async function markMeasurementFailure(
  db: D1Database,
  videoId: string,
  message: string,
) {
  const result = await db
    .prepare(
      `UPDATE project_videos SET status = 'failed', failure_stage = 'measurement',
        error_message = ?, measurement_attempts = measurement_attempts + 1,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'measuring'`,
    )
    .bind(message.slice(0, 500), videoId)
    .run();
  if (!result.meta.changes) {
    throw new ServiceError('CONFLICT', 'Video is not awaiting measurement', 409);
  }
}

export async function retryVideo(db: D1Database, videoId: string, user: SessionUser) {
  const video = await requireVideoById(db, videoId);
  await authorizeVideoWrite(db, video.project_id, user);
  if (video.status !== 'failed') {
    throw new ServiceError('CONFLICT', 'Only failed videos can be retried', 409);
  }
  if (video.failure_stage === 'measurement' && video.stream_uid) {
    await db
      .prepare(
        `UPDATE project_videos SET status = 'measuring', error_message = NULL,
          failure_stage = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(videoId)
      .run();
    return mapVideo(await requireVideoById(db, videoId));
  }
  throw new ServiceError(
    'CONFLICT',
    'Upload and Stream processing failures require a replacement upload',
    409,
  );
}

export async function listArchiveQueue(
  db: D1Database,
  gateway: StreamGateway,
  deliveryHost: string,
  now = new Date(),
) {
  const {results} = await db
    .prepare(
      `SELECT pv.id, pv.project_id, pv.stream_uid, pv.source_media_id, pv.status,
        pv.duration_seconds, pv.loudness_lufs, pv.gain_db, pv.error_message,
        pv.failure_stage, pv.archive_status, pv.archive_error, p.name project_name
       FROM project_videos pv JOIN projects p ON p.id = pv.project_id
       WHERE pv.status = 'ready' AND pv.archive_status IN ('pending', 'failed')
       ORDER BY pv.updated_at, pv.id LIMIT 20`,
    )
    .all<VideoRow & {project_name: string}>();
  const queue: ArchiveQueueItem[] = [];
  for (const video of results) {
    if (!video.stream_uid) continue;
    const download = await gateway.ensureDownload(video.stream_uid);
    if (download.status !== 'ready') continue;
    const expiresAt = new Date(now.getTime() + SERVICE_DOWNLOAD_EXPIRY_MINUTES * 60_000);
    const token = await gateway.createDownloadToken(video.stream_uid, expiresAt);
    queue.push({
      videoId: video.id,
      projectId: video.project_id,
      fileName: safeFileName(video.project_name, video.project_id),
      downloadUrl: token.startsWith('fake.')
        ? download.url!
        : `https://${deliveryHost}/${encodeURIComponent(token)}/downloads/default.mp4`,
    });
  }
  return queue;
}

export async function recordArchiveResult(
  db: D1Database,
  videoId: string,
  status: Extract<ArchiveStatus, 'archived' | 'failed'>,
  error: string | null,
) {
  const result = await db
    .prepare(
      `UPDATE project_videos SET archive_status = ?, archive_error = ?,
        archived_at = CASE WHEN ? = 'archived' THEN CURRENT_TIMESTAMP ELSE archived_at END,
        archive_attempts = archive_attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'ready'`,
    )
    .bind(
      status,
      status === 'failed' ? error?.slice(0, 500) || 'Archive failed' : null,
      status,
      videoId,
    )
    .run();
  if (!result.meta.changes) {
    throw new ServiceError('CONFLICT', 'Only ready videos can be archived', 409);
  }
  return mapVideo(await requireVideoById(db, videoId));
}

export function loudnessGain(loudnessLufs: number) {
  return Math.max(-12, Math.min(12, -16 - loudnessLufs));
}

async function authorizeVideoWrite(db: D1Database, projectId: string, user: SessionUser) {
  const project = await db
    .prepare(
      `SELECT p.id, p.name, p.creator_id, p.kind, p.status,
        EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?) is_member
       FROM projects p WHERE p.id = ?`,
    )
    .bind(user.id, projectId)
    .first<ProjectAuthorizationRow>();
  if (!project || project.status !== 'active') {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  if (project.kind !== 'project') {
    throw new ServiceError('VALIDATION_FAILED', 'Ideas cannot have primary videos', 400);
  }
  if (user.role !== 'admin' && project.creator_id !== user.id && !project.is_member) {
    throw new ServiceError(
      'AUTH_FORBIDDEN',
      'Project membership or creator permission is required',
      403,
    );
  }
}

function videoByProject(db: D1Database, projectId: string) {
  return db
    .prepare(`${videoSelect()} WHERE project_id = ?`)
    .bind(projectId)
    .first<VideoRow>();
}

async function requireVideoById(db: D1Database, videoId: string) {
  const video = await db
    .prepare(`${videoSelect()} WHERE id = ?`)
    .bind(videoId)
    .first<VideoRow>();
  if (!video) throw new ServiceError('NOT_FOUND', 'Video not found', 404);
  return video;
}

function videoSelect() {
  return `SELECT id, project_id, stream_uid, source_media_id, status,
    duration_seconds, loudness_lufs, gain_db, error_message, failure_stage,
    archive_status, archive_error FROM project_videos`;
}

function mapVideo(row: VideoRow): ProjectVideo {
  return {
    id: row.id,
    projectId: row.project_id,
    streamUid: row.stream_uid,
    sourceMediaId: row.source_media_id,
    status: row.status as VideoStatus,
    durationSeconds: row.duration_seconds,
    loudnessLufs: row.loudness_lufs,
    gainDb: row.gain_db,
    errorMessage: row.error_message,
    failureStage: row.failure_stage as VideoFailureStage | null,
    archiveStatus: row.archive_status as ArchiveStatus,
    archiveError: row.archive_error,
  };
}

function canReplace(status: string) {
  return status === 'failed' || status === 'pending_upload';
}

async function canReplaceUpload(db: D1Database, video: VideoRow, now: Date) {
  if (canReplace(video.status)) return true;
  if (video.status !== 'uploading') return false;
  const row = await db
    .prepare('SELECT upload_expires_at FROM project_videos WHERE id = ?')
    .bind(video.id)
    .first<{upload_expires_at: string | null}>();
  return Boolean(
    row?.upload_expires_at && Date.parse(row.upload_expires_at) <= now.getTime(),
  );
}

function safeFileName(projectName: string, projectId: string) {
  const slug = projectName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || projectId}.mp4`;
}
