import React, {useEffect, useState} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';
import * as Sentry from '@sentry/react';
import Header from '../components/header';
import HeroSection from '../components/HeroSection';
import CountdownTimer from '../components/CountdownTimer';
import InfoSection from '../components/InfoSection';
import './styles.css';

const Login = ({firebase, auth, profile, router}) => {
  // Compute if hackweek has started and countdown to Friday 9 AM PT
  const HACKWEEK_START_ISO = '2025-08-18T00:00:00';

  const getMsUntilFriday9PT = () => {
    const now = new Date();
    const laNow = new Date(
      now.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})
    );

    // Determine upcoming Friday 9:00:00 in LA time
    const laTarget = new Date(laNow.getTime());
    const laDay = laNow.getDay(); // 0=Sun ... 5=Fri
    let daysUntilFriday = (5 - laDay + 7) % 7;
    // If it's Friday and past 9 AM, move to next Friday
    const isFriday = daysUntilFriday === 0;
    laTarget.setDate(laNow.getDate() + daysUntilFriday);
    laTarget.setHours(9, 0, 0, 0);
    if (
      isFriday &&
      (laNow.getHours() > 9 ||
        (laNow.getHours() === 9 && (laNow.getMinutes() > 0 || laNow.getSeconds() > 0)))
    ) {
      laTarget.setDate(laTarget.getDate() + 7);
    }

    // Convert LA wall time target to actual instant by adjusting with offset between local and LA now
    const offsetDeltaMs = now.getTime() - laNow.getTime();
    const targetInstantMs = laTarget.getTime() + offsetDeltaMs;
    const diff = targetInstantMs - now.getTime();
    return diff > 0 ? diff : 0;
  };

  const getHasHackStarted = () => new Date() >= new Date(HACKWEEK_START_ISO);

  const [msUntilFridayPT, setMsUntilFridayPT] = useState(getMsUntilFriday9PT());
  const [hasHackStarted, setHasHackStarted] = useState(getHasHackStarted());

  const getNextFriday9amPT = () => {
    const now = new Date();
    const laNow = new Date(
      now.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})
    );
    const laTarget = new Date(laNow.getTime());
    const laDay = laNow.getDay(); // 0=Sun ... 6=Sat
    const daysUntilFriday = (5 - laDay + 7) % 7; // 5 = Friday
    laTarget.setDate(laNow.getDate() + daysUntilFriday);
    laTarget.setHours(9, 0, 0, 0);
    if (
      daysUntilFriday === 0 &&
      (laNow.getHours() > 9 ||
        (laNow.getHours() === 9 && (laNow.getMinutes() > 0 || laNow.getSeconds() > 0)))
    ) {
      laTarget.setDate(laTarget.getDate() + 7);
    }
    const offsetDeltaMs = now.getTime() - laNow.getTime();
    const targetInstantMs = laTarget.getTime() + offsetDeltaMs;
    return new Date(targetInstantMs);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setMsUntilFridayPT(getMsUntilFriday9PT());
      setHasHackStarted(getHasHackStarted());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return {days, hours, minutes, seconds};
  };

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
        {hasHackStarted ? (
          <section className="hero-section">
            <div className="hero-content">
              <h1>HACK TIME!!!</h1>
              <CountdownTimer targetDate={getNextFriday9amPT()} />
              <p className="hero-subtitle">until video submission deadline</p>
            </div>
          </section>
        ) : (
          <HeroSection />
        )}

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
