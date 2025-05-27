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
          <h1 className="header-title">
            <Link to="/">#HACKWEEK</Link>
          </h1>
        </div>
        {showMicroTimer && (
          <div className="header-countdown">
            <MicroCountdownTimer />
          </div>
        )}

        <div className="header-auth">
          {!isAuthenticated ? (
            <Button onClick={onLogin} size="sm">
              <GoogleIcon className="google-icon" />
              Sign in with Google
            </Button>
          ) : (
            <div className="auth-info">
              <div className="avatar-container">
                <button onClick={onLogout} className="avatar-button" type="button">
                  <Avatar user={user} />
                </button>
              </div>
              <div className="user-email">
                <p>
                  Logged in as
                  <br />
                  {user?.email}
                </p>
              </div>
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
