import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';
import * as Sentry from '@sentry/react';
import Header from '../components/header';
import HeroSection from '../components/HeroSection';
import InfoSection from '../components/InfoSection';
import './styles.css';

const Login = ({firebase, auth, profile, router}) => {
  if (!isLoaded(auth)) {
    return (
      <div className="loading-indicator">
        <span>Loading</span>
      </div>
    );
  }

  const googleLogin = () => {
    return firebase
      .login({provider: 'google', type: 'popup'})
      .then(() => {
        router.push('/');
      })
      .catch((error) => {
        console.error(error);
        Sentry.captureException(error);
      });
  };

  const handleLogout = () => {
    return firebase
      .logout()
      .then(() => {
        // Handle successful logout
      })
      .catch((error) => {
        console.error(error);
        Sentry.captureException(error);
      });
  };

  // Redirect if user is authenticated
  if (isLoaded(auth) && !isEmpty(auth)) {
    router.push('/');
    return null;
  }

  return (
    <div className="landing-page">
      <Header
        onLogin={googleLogin}
        onLogout={handleLogout}
        isAuthenticated={isLoaded(auth) && !isEmpty(auth)}
        user={profile}
        showMicroTimer={false}
      />
      <main>
        <HeroSection />

        {/* <InfoSection
          title="Innovate Together"
          description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
          imageUrl="https://via.placeholder.com/600x400"
          imageAlt="People collaborating"
        />

        <InfoSection
          title="Build the Future"
          description="Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
          imageUrl="https://via.placeholder.com/600x400"
          imageAlt="Future technology"
          isReversed
        />

        <InfoSection
          title="Make an Impact"
          description="Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo."
          imageUrl="https://via.placeholder.com/600x400"
          imageAlt="Impact visualization"
        /> */}
      </main>
    </div>
  );
};

Login.propTypes = {
  firebase: PropTypes.shape({
    login: PropTypes.func.isRequired,
    logout: PropTypes.func.isRequired,
  }).isRequired,
  auth: PropTypes.object,
  profile: PropTypes.object,
  router: PropTypes.object.isRequired,
};

Login.contextTypes = {
  router: PropTypes.object.isRequired,
};

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    profile: pathToJS(firebase, 'profile'),
  }))
)(Login);
