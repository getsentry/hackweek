ALTER TABLE user_sessions
  ADD COLUMN view_as_member INTEGER NOT NULL DEFAULT 0
  CHECK (view_as_member IN (0, 1));
