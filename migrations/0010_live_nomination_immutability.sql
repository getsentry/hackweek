PRAGMA foreign_keys = ON;

CREATE TRIGGER project_nominations_lock_insert
BEFORE INSERT ON project_nominations
BEGIN
  SELECT RAISE(ABORT, 'award nominations cannot change while voting is enabled')
  WHERE EXISTS (
    SELECT 1 FROM projects p
    JOIN years y ON y.id = p.year_id
    WHERE p.id = NEW.project_id
      AND y.voting_enabled = 1
      AND y.id = (SELECT MAX(id) FROM years)
  );
END;

CREATE TRIGGER project_nominations_lock_update
BEFORE UPDATE OF project_id, award_category_id, position ON project_nominations
BEGIN
  SELECT RAISE(ABORT, 'award nominations cannot change while voting is enabled')
  WHERE EXISTS (
    SELECT 1 FROM projects p
    JOIN years y ON y.id = p.year_id
    WHERE p.id IN (OLD.project_id, NEW.project_id)
      AND y.voting_enabled = 1
      AND y.id = (SELECT MAX(id) FROM years)
  );
END;

CREATE TRIGGER project_nominations_lock_delete
BEFORE DELETE ON project_nominations
BEGIN
  SELECT RAISE(ABORT, 'award nominations cannot change while voting is enabled')
  WHERE EXISTS (
    SELECT 1 FROM projects p
    JOIN years y ON y.id = p.year_id
    WHERE p.id = OLD.project_id
      AND y.voting_enabled = 1
      AND y.id = (SELECT MAX(id) FROM years)
  );
END;
