import React from 'react';
import PropTypes from 'prop-types';
import Button from '../Button';
import GoogleIcon from '../GoogleIcon';
import './styles.css';

const Header = ({
  title = '#HACKWEEK 2025',
  isAuthenticated = false,
  onLogin,
  onLogout,
  user = null,
}) => {
  const renderAuthButton = () => {
    if (isAuthenticated && user) {
      return (
        <Button priority="default" size="sm" onClick={onLogout} iconPosition="left">
          Sign out
        </Button>
      );
    }

    return (
      <Button
        priority="default"
        size="sm"
        onClick={onLogin}
        icon={<GoogleIcon />}
        iconPosition="left"
      >
        Sign in with Google
      </Button>
    );
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-title">
          <h1>{title}</h1>
        </div>
        <div className="header-nav">{renderAuthButton()}</div>
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

        .header-nav {
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
          .header-nav button {
            padding: 6px 12px;
            font-size: 14px;
          }
        }
      `}</style>
    </header>
  );
};

Header.propTypes = {
  title: PropTypes.string,
  isAuthenticated: PropTypes.bool,
  onLogin: PropTypes.func.isRequired,
  onLogout: PropTypes.func,
  user: PropTypes.shape({
    email: PropTypes.string,
    displayName: PropTypes.string,
  }),
};

export default Header;
