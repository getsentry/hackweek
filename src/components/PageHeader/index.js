import React from 'react';
import './styles.css';

const PageHeader = ({title, currentYear, className = '', ...props}) => (
  <div>
    <div style={{display: 'flex', alignItems: 'baseline', gap: '0.5em'}}>
      {title && <h2 className="page-header-title">{title}</h2>}
      {currentYear && <h2>{currentYear}</h2>}
    </div>
    <hr class="squiggle-line" />
  </div>
);

export default PageHeader;
