PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS votes_validate_insert;
DROP TRIGGER IF EXISTS votes_validate_update;

CREATE TRIGGER votes_validate_insert BEFORE INSERT ON votes
BEGIN
  SELECT RAISE(ABORT, 'voting is not enabled for this year')
  WHERE NOT EXISTS (
    SELECT 1 FROM years WHERE id = NEW.year_id AND voting_enabled = 1
  );
  SELECT RAISE(ABORT, 'vote project must be an active project in vote year')
  WHERE NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = NEW.project_id AND year_id = NEW.year_id
      AND kind = 'project' AND status = 'active'
  );
  SELECT RAISE(ABORT, 'vote category must belong to vote year')
  WHERE NOT EXISTS (
    SELECT 1 FROM award_categories
    WHERE id = NEW.award_category_id AND year_id = NEW.year_id
  );
  SELECT RAISE(ABORT, 'vote project is not eligible for this award category')
  WHERE EXISTS (
    SELECT 1 FROM project_nominations WHERE project_id = NEW.project_id
  ) AND NOT EXISTS (
    SELECT 1 FROM project_nominations
    WHERE project_id = NEW.project_id
      AND award_category_id = NEW.award_category_id
  );
  SELECT RAISE(ABORT, 'users cannot vote for their own project')
  WHERE EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = NEW.project_id
      AND (
        p.creator_id = NEW.creator_id
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = NEW.creator_id
        )
      )
  );
END;

CREATE TRIGGER votes_validate_update
BEFORE UPDATE OF year_id, creator_id, project_id, award_category_id ON votes
BEGIN
  SELECT RAISE(ABORT, 'voting is not enabled for this year')
  WHERE NOT EXISTS (
    SELECT 1 FROM years WHERE id = NEW.year_id AND voting_enabled = 1
  );
  SELECT RAISE(ABORT, 'vote project must be an active project in vote year')
  WHERE NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = NEW.project_id AND year_id = NEW.year_id
      AND kind = 'project' AND status = 'active'
  );
  SELECT RAISE(ABORT, 'vote category must belong to vote year')
  WHERE NOT EXISTS (
    SELECT 1 FROM award_categories
    WHERE id = NEW.award_category_id AND year_id = NEW.year_id
  );
  SELECT RAISE(ABORT, 'vote project is not eligible for this award category')
  WHERE EXISTS (
    SELECT 1 FROM project_nominations WHERE project_id = NEW.project_id
  ) AND NOT EXISTS (
    SELECT 1 FROM project_nominations
    WHERE project_id = NEW.project_id
      AND award_category_id = NEW.award_category_id
  );
  SELECT RAISE(ABORT, 'users cannot vote for their own project')
  WHERE EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = NEW.project_id
      AND (
        p.creator_id = NEW.creator_id
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = NEW.creator_id
        )
      )
  );
END;
