ALTER TABLE users ADD COLUMN access_subject TEXT;

CREATE UNIQUE INDEX users_access_subject_idx
  ON users(access_subject)
  WHERE access_subject IS NOT NULL;
