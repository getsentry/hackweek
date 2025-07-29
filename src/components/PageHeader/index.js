import React from 'react';
import {Link} from 'react-router';
import Button from '../Button';
import './styles.css';

const PageHeader = ({
  title,
  currentYear,
  className = '',
  showAddProjectButton,
  canEdit,
  onEdit,
  onDelete,
  editLink,
  ...props
}) => (
  <div className={`page-header-container ${className}`.trim()}>
    <div className="page-header-title-container">
      {title && <h2 className="page-header-title no-forced-lowercase">{title}</h2>}
      {currentYear && <h2 className="page-header-title">{currentYear}</h2>}
    </div>
    <div className="page-header-action">
      {showAddProjectButton && (
        <Link to="/new-project">
          <Button priority="primary" size="sm">
            Add something
          </Button>
        </Link>
      )}
      {canEdit && (
        <>
          {editLink && (
            <Link to={editLink} className="btn-set-btn">
              <Button priority="secondary" size="sm">
                Edit Project
              </Button>
            </Link>
          )}
          <Button onClick={onDelete} priority="danger" size="sm" type="button">
            Delete Project
          </Button>
        </>
      )}
    </div>
  </div>
);

export default PageHeader;
