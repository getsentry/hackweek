PRAGMA foreign_keys = ON;

DROP INDEX users_access_subject_idx;
ALTER TABLE users DROP COLUMN access_subject;
ALTER TABLE users ADD COLUMN google_subject TEXT;

CREATE UNIQUE INDEX users_google_subject_idx
  ON users(google_subject)
  WHERE google_subject IS NOT NULL;

CREATE TABLE oauth_login_attempts (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK (length(state_hash) = 64),
  nonce TEXT NOT NULL CHECK (length(nonce) BETWEEN 32 AND 255),
  code_verifier TEXT NOT NULL CHECK (length(code_verifier) BETWEEN 43 AND 128),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
) STRICT;

CREATE INDEX oauth_login_attempts_expiry_idx
  ON oauth_login_attempts(expires_at);

CREATE TRIGGER oauth_login_attempts_delete_consumed
AFTER UPDATE OF consumed_at ON oauth_login_attempts
WHEN NEW.consumed_at IS NOT NULL
BEGIN
  DELETE FROM oauth_login_attempts WHERE state_hash = NEW.state_hash;
END;

CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at),
  CHECK (last_used_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) STRICT;

CREATE INDEX user_sessions_user_idx ON user_sessions(user_id, expires_at);
CREATE INDEX user_sessions_expiry_idx ON user_sessions(expires_at);
