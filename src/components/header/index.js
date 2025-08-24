import React from 'react';
import PropTypes from 'prop-types';
import {Link} from 'react-router';
import Button from '../Button';
import GoogleIcon from '../GoogleIcon';
import Avatar from '../Avatar';
import MicroCountdownTimer from '../MicroCountdownTimer';
import logoSentry from '../../assets/logos/logo-sentry-symbol.svg';
import './styles.css';

const Header = ({onLogin, onLogout, isAuthenticated, user, showMicroTimer = true}) => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-title-logo-container">
          <img src={logoSentry} alt="Sentry Logo" className="header-logo" />
          <h3 className="header-title">
            <Link to="/projects?show=projects">#HACKWEEK</Link>
          </h3>
        </div>
        {showMicroTimer && (
          <div className="header-countdown">
            <MicroCountdownTimer />
          </div>
        )}

        <div className="header-auth">
          {!isAuthenticated ? (
            <Button onClick={onLogin} priority="secondary" size="xs">
              <GoogleIcon className="google-icon" />
              Sign in with Google
            </Button>
          ) : (
            <div className="avatar-container">
              <Button onClick={onLogout} priority="tertiary" size="xs" type="button">
                <span className="avatar-container-email">{user?.email}</span>
                <span className="avatar-container-logout">logout</span>
                <img src={user?.avatarUrl} className="avatar-container-image" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

Header.propTypes = {
  onLogin: PropTypes.func.isRequired,
  onLogout: PropTypes.func.isRequired,
  isAuthenticated: PropTypes.bool.isRequired,
  user: PropTypes.object,
  showMicroTimer: PropTypes.bool,
};

export default Header;
