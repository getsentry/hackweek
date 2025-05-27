import React from 'react';
import './styles.css';

const PageHeader = ({title, className = '', ...props}) => (
  <div>
    {title && <h2 className="page-header-title">{title}</h2>}
    <hr class="squiggle-line" />
  </div>
);

export default PageHeader;
