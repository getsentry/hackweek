import React from 'react';
import PropTypes from 'prop-types';
import {Link} from 'react-router';
import Button from '../Button';
import GoogleIcon from '../GoogleIcon';
import Avatar from '../Avatar';
import './styles.css';

const Header = ({onLogin, onLogout, isAuthenticated, user}) => {
  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="header-title">
          <Link to="/">#HACKWEEK</Link>
        </h1>
        <div className="header-auth">
          {!isAuthenticated ? (
            <Button onClick={onLogin} priority="default" size="sm" iconPosition="left">
              <GoogleIcon className="google-icon" />
              Sign in with Google
            </Button>
          ) : (
            <div className="auth-info">
              <div className="avatar-container">
                <button onClick={onLogout} className="avatar-button">
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
      <style jsx>{`
        .app-header {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          height: 60px;
          background: #ffffff;
          border-bottom: 1px solid #e0dce5;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04);
          z-index: 100;
        }

        .header-content {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 20px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-title h1 {
          font-size: 20px;
          font-weight: 600;
          color: #2b2233;
          margin: 0;
        }

        .header-auth {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .header-content {
            padding: 0 12px;
          }

          .header-title h1 {
            font-size: 16px;
          }
        }

        @media (max-width: 480px) {
          .header-auth button {
            padding: 6px 12px;
            font-size: 14px;
          }
        }
      `}</style>
    </header>
  );
};

Header.propTypes = {
  onLogin: PropTypes.func.isRequired,
  onLogout: PropTypes.func.isRequired,
  isAuthenticated: PropTypes.bool.isRequired,
  user: PropTypes.object,
};

export default Header;
