PRAGMA foreign_keys = ON;

ALTER TABLE project_videos ADD COLUMN upload_expires_at TEXT;
ALTER TABLE project_videos ADD COLUMN failure_stage TEXT
  CHECK (failure_stage IS NULL OR failure_stage IN ('upload', 'stream', 'measurement'));
ALTER TABLE project_videos ADD COLUMN measurement_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (measurement_attempts >= 0);
ALTER TABLE project_videos ADD COLUMN archive_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (archive_status IN ('pending', 'archiving', 'archived', 'failed'));
ALTER TABLE project_videos ADD COLUMN archive_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (archive_attempts >= 0);
ALTER TABLE project_videos ADD COLUMN archive_error TEXT;
ALTER TABLE project_videos ADD COLUMN archived_at TEXT;

CREATE INDEX project_videos_archive_status_idx
  ON project_videos(archive_status, updated_at);
