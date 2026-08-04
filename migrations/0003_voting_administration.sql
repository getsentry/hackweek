PRAGMA foreign_keys = ON;

DROP TRIGGER votes_validate_insert;
DROP TRIGGER votes_validate_update;

CREATE TRIGGER votes_validate_insert
BEFORE INSERT ON votes
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM years WHERE id = NEW.year_id AND voting_enabled = 1
    ) THEN RAISE(ABORT, 'voting is not enabled for this year')
    WHEN NOT EXISTS (
      SELECT 1 FROM projects
      WHERE id = NEW.project_id AND year_id = NEW.year_id
        AND kind = 'project' AND status = 'active'
    ) THEN RAISE(ABORT, 'vote project must be an active project in vote year')
    WHEN NOT EXISTS (
      SELECT 1 FROM award_categories
      WHERE id = NEW.award_category_id AND year_id = NEW.year_id
    ) THEN RAISE(ABORT, 'vote category must belong to vote year')
    WHEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = NEW.project_id AND (
        p.creator_id = NEW.creator_id OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = NEW.creator_id
        )
      )
    ) THEN RAISE(ABORT, 'users cannot vote for their own project')
  END;
END;

CREATE TRIGGER votes_validate_update
BEFORE UPDATE OF year_id, creator_id, project_id, award_category_id ON votes
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM years WHERE id = NEW.year_id AND voting_enabled = 1
    ) THEN RAISE(ABORT, 'voting is not enabled for this year')
    WHEN NOT EXISTS (
      SELECT 1 FROM projects
      WHERE id = NEW.project_id AND year_id = NEW.year_id
        AND kind = 'project' AND status = 'active'
    ) THEN RAISE(ABORT, 'vote project must be an active project in vote year')
    WHEN NOT EXISTS (
      SELECT 1 FROM award_categories
      WHERE id = NEW.award_category_id AND year_id = NEW.year_id
    ) THEN RAISE(ABORT, 'vote category must belong to vote year')
    WHEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = NEW.project_id AND (
        p.creator_id = NEW.creator_id OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = NEW.creator_id
        )
      )
    ) THEN RAISE(ABORT, 'users cannot vote for their own project')
  END;
END;

CREATE TRIGGER project_nominations_validate_insert
BEFORE INSERT ON project_nominations
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM projects p
      JOIN award_categories c ON c.id = NEW.award_category_id
      WHERE p.id = NEW.project_id AND p.year_id = c.year_id
        AND p.kind = 'project' AND p.status = 'active'
    ) THEN RAISE(ABORT, 'nomination category and project must belong to the same year')
  END;
END;

CREATE TRIGGER project_nominations_validate_update
BEFORE UPDATE OF project_id, award_category_id, position ON project_nominations
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM projects p
      JOIN award_categories c ON c.id = NEW.award_category_id
      WHERE p.id = NEW.project_id AND p.year_id = c.year_id
        AND p.kind = 'project' AND p.status = 'active'
    ) THEN RAISE(ABORT, 'nomination category and project must belong to the same year')
  END;
END;

CREATE TRIGGER awards_validate_insert
BEFORE INSERT ON awards
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM projects p
      JOIN award_categories c ON c.id = NEW.category_id
      WHERE p.id = NEW.project_id AND p.year_id = NEW.year_id
        AND c.year_id = NEW.year_id AND p.kind = 'project' AND p.status = 'active'
    ) THEN RAISE(ABORT, 'award references must belong to the award year')
  END;
END;

CREATE TRIGGER awards_validate_update
BEFORE UPDATE OF year_id, project_id, category_id ON awards
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM projects p
      JOIN award_categories c ON c.id = NEW.category_id
      WHERE p.id = NEW.project_id AND p.year_id = NEW.year_id
        AND c.year_id = NEW.year_id AND p.kind = 'project' AND p.status = 'active'
    ) THEN RAISE(ABORT, 'award references must belong to the award year')
  END;
END;

CREATE UNIQUE INDEX awards_year_category_idx ON awards(year_id, category_id);

CREATE TABLE screening_order (
  year_id TEXT NOT NULL REFERENCES years(id) ON UPDATE CASCADE ON DELETE CASCADE,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (year_id, position),
  UNIQUE (project_id, year_id),
  FOREIGN KEY (project_id, year_id) REFERENCES projects(id, year_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TRIGGER screening_order_validate_insert
BEFORE INSERT ON screening_order
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM projects
      WHERE id = NEW.project_id AND year_id = NEW.year_id
        AND kind = 'project' AND status = 'active'
    ) THEN RAISE(ABORT, 'screening entry must reference an active project in its year')
  END;
END;

CREATE TRIGGER screening_order_validate_update
BEFORE UPDATE OF year_id, project_id, position ON screening_order
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM projects
      WHERE id = NEW.project_id AND year_id = NEW.year_id
        AND kind = 'project' AND status = 'active'
    ) THEN RAISE(ABORT, 'screening entry must reference an active project in its year')
  END;
END;
