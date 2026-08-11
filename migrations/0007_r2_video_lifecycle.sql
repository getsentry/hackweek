PRAGMA foreign_keys = OFF;

ALTER TABLE project_videos RENAME TO legacy_project_videos;

CREATE TABLE project_videos (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  original_name TEXT NOT NULL CHECK (length(trim(original_name)) BETWEEN 1 AND 255),
  content_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 5368709120),
  original_r2_key TEXT UNIQUE,
  processed_r2_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'retired')),
  processing_attempt INTEGER NOT NULL DEFAULT 1 CHECK (processing_attempt >= 1),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  loudness_lufs REAL,
  gain_db REAL CHECK (gain_db IS NULL OR gain_db BETWEEN -12 AND 12),
  error_message TEXT,
  retired_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status = 'retired') = (retired_at IS NOT NULL)),
  CHECK (status = 'retired' OR (original_r2_key IS NOT NULL AND size_bytes IS NOT NULL))
) STRICT;

INSERT INTO project_videos (
  id, project_id, original_name, status, processing_attempt,
  duration_seconds, loudness_lufs, gain_db, error_message,
  retired_at, created_at, updated_at
)
SELECT
  id, project_id, 'Legacy Stream video', 'retired', 1,
  duration_seconds, loudness_lufs, gain_db, error_message,
  updated_at, created_at, updated_at
FROM legacy_project_videos;

DROP TABLE legacy_project_videos;
DROP TABLE stream_events;

CREATE UNIQUE INDEX project_videos_active_project_idx
  ON project_videos(project_id) WHERE retired_at IS NULL;
CREATE INDEX project_videos_status_idx
  ON project_videos(status, updated_at);

CREATE TABLE video_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  r2_upload_id TEXT,
  original_r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK (length(trim(original_name)) BETWEEN 1 AND 255),
  content_type TEXT,
  expected_size_bytes INTEGER NOT NULL CHECK (expected_size_bytes BETWEEN 1 AND 5368709120),
  part_size_bytes INTEGER NOT NULL CHECK (part_size_bytes >= 5242880),
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'uploading', 'completing', 'completed', 'aborted', 'expired')),
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (r2_upload_id IS NOT NULL OR status IN ('creating', 'aborted')),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX video_uploads_active_project_idx
  ON video_uploads(project_id)
  WHERE status IN ('creating', 'uploading', 'completing');
CREATE INDEX video_uploads_expiry_idx
  ON video_uploads(status, expires_at);

CREATE TRIGGER video_uploads_reject_active_submission
BEFORE INSERT ON video_uploads
WHEN NEW.status IN ('creating', 'uploading', 'completing')
  AND EXISTS (
    SELECT 1 FROM project_videos
    WHERE project_id = NEW.project_id AND retired_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'active project video exists');
END;

CREATE TRIGGER project_videos_reject_active_upload
BEFORE INSERT ON project_videos
WHEN NEW.retired_at IS NULL
  AND EXISTS (
    SELECT 1 FROM video_uploads
    WHERE project_id = NEW.project_id
      AND status IN ('creating', 'uploading', 'completing')
  )
BEGIN
  SELECT RAISE(ABORT, 'active project upload exists');
END;

CREATE TABLE video_upload_parts (
  upload_id TEXT NOT NULL REFERENCES video_uploads(id) ON UPDATE CASCADE ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  etag TEXT NOT NULL CHECK (length(etag) > 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_id, part_number)
) STRICT, WITHOUT ROWID;

CREATE TABLE video_processing_attempts (
  video_id TEXT NOT NULL REFERENCES project_videos(id) ON UPDATE CASCADE ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  output_r2_key TEXT,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (video_id, attempt)
) STRICT, WITHOUT ROWID;

CREATE INDEX video_processing_attempts_status_idx
  ON video_processing_attempts(status, created_at);

PRAGMA foreign_keys = ON;
