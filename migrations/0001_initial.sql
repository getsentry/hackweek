PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  source_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE years (
  id TEXT PRIMARY KEY NOT NULL,
  voting_enabled INTEGER NOT NULL DEFAULT 0 CHECK (voting_enabled IN (0, 1)),
  submissions_closed INTEGER NOT NULL DEFAULT 0 CHECK (submissions_closed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE groups (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  year_id TEXT NOT NULL REFERENCES years(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  creator_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, year_id)
) STRICT;

CREATE INDEX groups_year_name_idx ON groups(year_id, name);
CREATE INDEX groups_creator_idx ON groups(creator_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  year_id TEXT NOT NULL REFERENCES years(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  creator_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  group_id TEXT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  summary TEXT,
  repository TEXT,
  kind TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('project', 'idea')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  needs_help INTEGER NOT NULL DEFAULT 0 CHECK (needs_help IN (0, 1)),
  help_details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, year_id),
  FOREIGN KEY (group_id, year_id) REFERENCES groups(id, year_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) STRICT;

CREATE INDEX projects_year_status_idx ON projects(year_id, status);
CREATE INDEX projects_creator_idx ON projects(creator_id);
CREATE INDEX projects_group_idx ON projects(group_id);

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX project_members_user_idx ON project_members(user_id);

CREATE TABLE award_categories (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  year_id TEXT NOT NULL REFERENCES years(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  creator_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, year_id)
) STRICT;

CREATE INDEX award_categories_year_idx ON award_categories(year_id, name);
CREATE INDEX award_categories_creator_idx ON award_categories(creator_id);

CREATE TABLE project_nominations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  award_category_id TEXT NOT NULL REFERENCES award_categories(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position IN (1, 2)),
  PRIMARY KEY (project_id, award_category_id),
  UNIQUE (project_id, position)
) STRICT, WITHOUT ROWID;

CREATE INDEX project_nominations_category_idx
  ON project_nominations(award_category_id);

CREATE TABLE votes (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  year_id TEXT NOT NULL REFERENCES years(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  creator_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  award_category_id TEXT NOT NULL REFERENCES award_categories(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year_id, creator_id, award_category_id)
) STRICT;

CREATE INDEX votes_project_idx ON votes(project_id);
CREATE INDEX votes_category_idx ON votes(year_id, award_category_id);
CREATE INDEX votes_creator_idx ON votes(year_id, creator_id);

CREATE TABLE awards (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  year_id TEXT NOT NULL REFERENCES years(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES award_categories(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  creator_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year_id, project_id, category_id)
) STRICT;

CREATE INDEX awards_project_idx ON awards(project_id);
CREATE INDEX awards_category_idx ON awards(category_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  media_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'missing', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX media_project_idx ON media(project_id);
CREATE INDEX media_status_idx ON media(status);

CREATE TABLE project_videos (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  stream_uid TEXT UNIQUE,
  source_media_id TEXT REFERENCES media(id) ON UPDATE CASCADE ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN (
      'pending_upload', 'uploading', 'processing', 'measuring', 'ready', 'failed', 'archived'
    )),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  loudness_lufs REAL,
  gain_db REAL CHECK (gain_db IS NULL OR gain_db BETWEEN -12 AND 12),
  error_message TEXT,
  sort_order INTEGER CHECK (sort_order IS NULL OR sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status <> 'ready' OR (stream_uid IS NOT NULL AND gain_db IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX project_videos_sort_order_idx
  ON project_videos(sort_order) WHERE sort_order IS NOT NULL;
CREATE INDEX project_videos_status_idx ON project_videos(status);

CREATE TABLE stream_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  stream_uid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX stream_events_stream_idx ON stream_events(stream_uid, received_at);
