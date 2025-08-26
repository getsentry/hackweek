import React from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import './styles.css';

const YearCard = ({year, to}) => {
  return (
    <Link to={to} className="year-card-link">
      <div className="year-card">
        <div className="year-card-content">
          <h3 className="year-card-title">Hackweek {year}</h3>
          <div className="year-card-arrow">
            <span>→</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

YearCard.propTypes = {
  year: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired,
};

export default YearCard;
