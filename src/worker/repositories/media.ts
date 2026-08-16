import type {MediaSummary} from '../../shared/projects';
import {ServiceError} from '../services/errors';
import {currentYearIdSql, effectiveYearFlags} from './years';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

interface UserContext {
  id: string;
  role: 'member' | 'admin';
}

interface MediaRecord {
  id: string;
  project_id: string;
  original_name: string;
  r2_key: string;
  media_type: string | null;
  size_bytes: number | null;
  status: MediaSummary['status'];
  created_at: string;
}

export async function uploadMedia(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  file: File,
  user: UserContext,
): Promise<MediaSummary> {
  if (!file.name.trim() || file.name.length > 255) {
    throw new ServiceError('VALIDATION_FAILED', 'Media filename is invalid', 400);
  }
  if (file.size <= 0 || file.size > MAX_MEDIA_BYTES) {
    throw new ServiceError(
      'VALIDATION_FAILED',
      `Media must be between 1 byte and ${MAX_MEDIA_BYTES / 1024 / 1024} MiB`,
      400,
    );
  }
  await assertCanManageMedia(db, projectId, user);
  const id = crypto.randomUUID();
  const r2Key = mediaKey(projectId, id, file.name);
  await db
    .prepare(
      `INSERT INTO media
        (id, source_id, project_id, original_name, r2_key, media_type, size_bytes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .bind(id, id, projectId, file.name, r2Key, file.type || null, file.size)
    .run();

  try {
    await bucket.put(r2Key, file.stream(), {
      httpMetadata: {contentType: file.type || 'application/octet-stream'},
      customMetadata: {projectId, mediaId: id},
    });
    await db
      .prepare(
        `UPDATE media SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(id)
      .run();
  } catch {
    await Promise.allSettled([
      bucket.delete(r2Key),
      db
        .prepare(
          `UPDATE media SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(id)
        .run(),
    ]);
    throw new ServiceError('STORAGE_FAILED', 'Media upload failed', 500);
  }

  return {
    id,
    originalName: file.name,
    mediaType: file.type || null,
    sizeBytes: file.size,
    status: 'available',
    createdAt: new Date().toISOString(),
  };
}

export async function downloadMedia(db: D1Database, bucket: R2Bucket, mediaId: string) {
  const media = await getMediaRecord(db, mediaId);
  if (media.status !== 'available') {
    throw new ServiceError('NOT_FOUND', 'Media is not available', 404);
  }
  const object = await bucket.get(media.r2_key);
  if (!object) {
    await db
      .prepare(
        `UPDATE media SET status = 'missing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(mediaId)
      .run();
    throw new ServiceError('NOT_FOUND', 'Media object is missing', 404);
  }
  return {media, object};
}

export async function deleteMedia(
  db: D1Database,
  bucket: R2Bucket,
  mediaId: string,
  user: UserContext,
) {
  const media = await getMediaRecord(db, mediaId);
  await assertCanManageMedia(db, media.project_id, user);
  await bucket.delete(media.r2_key);
  await db.prepare('DELETE FROM media WHERE id = ?').bind(mediaId).run();
}

export function attachmentHeaders(
  media: MediaRecord,
  object: R2ObjectBody,
  preview = false,
) {
  const headers = new Headers();
  const isImagePreview = preview && isImageMediaType(media.media_type);
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', media.media_type || 'application/octet-stream');
  headers.set('Content-Length', String(object.size));
  headers.set(
    'Content-Disposition',
    contentDisposition(media.original_name, isImagePreview ? 'inline' : 'attachment'),
  );
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (isImagePreview) {
    headers.set(
      'Content-Security-Policy',
      "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'",
    );
  }
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return headers;
}

async function assertCanManageMedia(
  db: D1Database,
  projectId: string,
  user: UserContext,
) {
  const project = await db
    .prepare(
      `SELECT p.year_id, p.kind, p.creator_id, y.voting_enabled, y.submissions_closed,
        ${currentYearIdSql} current_year_id,
        EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?) is_member
       FROM projects p JOIN years y ON y.id = p.year_id
       WHERE p.id = ? AND p.status = 'active'`,
    )
    .bind(user.id, projectId)
    .first<{
      year_id: string;
      kind: string;
      creator_id: string;
      voting_enabled: number;
      submissions_closed: number;
      current_year_id: string;
      is_member: number;
    }>();
  if (!project) {
    throw new ServiceError('NOT_FOUND', 'Project not found', 404);
  }
  if (effectiveYearFlags(project.year_id, project).submissionsClosed) {
    throw new ServiceError('AUTH_FORBIDDEN', 'Submissions are closed', 403);
  }
  if (project.kind !== 'project') {
    throw new ServiceError('VALIDATION_FAILED', 'Ideas cannot have media', 400);
  }
  if (user.role !== 'admin' && !project.is_member && project.creator_id !== user.id) {
    throw new ServiceError(
      'AUTH_FORBIDDEN',
      'Project membership or creator permission is required',
      403,
    );
  }
}

async function getMediaRecord(db: D1Database, mediaId: string) {
  const media = await db
    .prepare(
      `SELECT id, project_id, original_name, r2_key, media_type, size_bytes, status, created_at
       FROM media WHERE id = ?`,
    )
    .bind(mediaId)
    .first<MediaRecord>();
  if (!media) {
    throw new ServiceError('NOT_FOUND', 'Media not found', 404);
  }
  return media;
}

function mediaKey(projectId: string, mediaId: string, originalName: string) {
  const safeName = originalName
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `projects/${projectId}/media/${mediaId}/${safeName || 'attachment'}`;
}

function isImageMediaType(mediaType: string | null) {
  return mediaType?.toLowerCase().startsWith('image/') ?? false;
}

function contentDisposition(filename: string, disposition: 'attachment' | 'inline') {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
