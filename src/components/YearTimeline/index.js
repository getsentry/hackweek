import React from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import './styles.css';

const TimelineItem = ({year, to, isLast}) => {
  return (
    <div className="timeline-item">
      <div className="timeline-marker">
        <div className="timeline-dot"></div>
        {!isLast && <div className="timeline-line"></div>}
      </div>
      <div className="timeline-content">
        <Link to={to} className="timeline-card">
          <div className="timeline-year">HACKWEEK {year}</div>
          <div className="timeline-arrow">→</div>
        </Link>
      </div>
    </div>
  );
};

TimelineItem.propTypes = {
  year: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired,
  isLast: PropTypes.bool,
};

const YearTimeline = ({years}) => {
  // Sort years in descending order (most recent first)
  const sortedYears = [...years].sort((a, b) => b.key - a.key);

  return (
    <div className="year-timeline">
      <div className="timeline-container">
        {sortedYears.map((year, index) => (
          <TimelineItem
            key={year.key}
            year={year.key}
            to={`/admin/years/${year.key}`}
            isLast={index === sortedYears.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

YearTimeline.propTypes = {
  years: PropTypes.array.isRequired,
};

export default YearTimeline;
