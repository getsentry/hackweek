import React from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import logoSentryFull from '../../assets/logos/logo-sentry-full.svg';
import './styles.css';

const FooterSection = ({currentYear, profile}) => (
  <footer className="app-footer">
    <hr class="squiggle-line" />
    <div className="footer-content">
      <div className="footer-title-logo-container">
        <img src={logoSentryFull} alt="Sentry Logo" className="footer-logo" />
      </div>
      <span className="footer-links">
        <Link to="/projects">This Year ({currentYear})</Link>
        <Link to="/years">The Archives</Link>
        {profile?.admin && <Link to="/admin">Admin</Link>}
      </span>
    </div>
  </footer>
);

FooterSection.propTypes = {
  currentYear: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  profile: PropTypes.object,
};

export default FooterSection;
