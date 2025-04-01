import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';
import * as Sentry from '@sentry/react';
import moment from 'moment';
import Button from '../components/Button';
import GoogleIcon from '../components/GoogleIcon';

class CountdownTimer extends Component {
  state = {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  };

  componentDidMount() {
    this.interval = setInterval(this.updateCountdown, 1000);
    this.updateCountdown();
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  updateCountdown = () => {
    const hackweekStart = moment('2024-08-18');
    const now = moment();
    const duration = moment.duration(hackweekStart.diff(now));

    this.setState({
      days: Math.abs(Math.floor(duration.asDays())),
      hours: Math.abs(duration.hours()),
      minutes: Math.abs(duration.minutes()),
      seconds: Math.abs(duration.seconds()),
    });
  };

  render() {
    const {days, hours, minutes, seconds} = this.state;
    return (
      <div className="countdown-timer">
        <h1>HACKWEEK 2024</h1>
        <div className="countdown-values">
          <div className="countdown-segment">
            <span className="countdown-number">{Math.abs(days)}</span>
            <span className="countdown-label">days</span>
          </div>
          <div className="countdown-segment">
            <span className="countdown-number">{Math.abs(hours)}</span>
            <span className="countdown-label">hours</span>
          </div>
          <div className="countdown-segment">
            <span className="countdown-number">{Math.abs(minutes)}</span>
            <span className="countdown-label">minutes</span>
          </div>
          <div className="countdown-segment">
            <span className="countdown-number">{Math.abs(seconds)}</span>
            <span className="countdown-label">seconds</span>
          </div>
        </div>
        <h2>until the innovation begins</h2>
      </div>
    );
  }
}

class Login extends Component {
  static propTypes = {
    firebase: PropTypes.shape({
      login: PropTypes.func.isRequired,
    }),
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  googleLogin = (loginData) => {
    return this.props.firebase
      .login({provider: 'google', type: 'popup'})
      .then(() => {
        this.context.router.push('/');
      })
      .catch((error) => {
        console.error(error);
        Sentry.captureException(error);
      });
  };

  componentWillReceiveProps({auth}) {
    if (isLoaded(auth) && !isEmpty(auth)) {
      this.context.router.push('/');
    }
  }

  render() {
    const {auth} = this.props;

    if (!isLoaded(auth)) {
      return (
        <div className="loading-indicator">
          <span>Loading</span>
        </div>
      );
    }

    return (
      <div>
        <header className="app-header">
          <div className="header-content">
            <div className="header-title">
              <h1>#HACKWEEK 2025</h1>
            </div>
            <div className="header-nav">
              <Button
                priority="default"
                size="sm"
                onClick={this.googleLogin}
                icon={<GoogleIcon />}
                iconPosition="left"
              >
                Sign in with Google
              </Button>
            </div>
          </div>
        </header>
        <div className="login-container">
          <CountdownTimer />
        </div>
        <style jsx global>{`
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            min-height: 100vh;
          }
        `}</style>
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

          .login-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: calc(100vh - 60px);
            width: 100%;
            color: #2b2233;
            padding: 20px;
            box-sizing: border-box;
          }

          .countdown-timer {
            text-align: center;
            margin-bottom: 60px;
          }

          .countdown-timer h1 {
            font-size: 48px;
            margin-bottom: 30px;
            font-weight: bold;
            color: #2b2233;
          }

          .countdown-timer h2 {
            font-size: 24px;
            margin-top: 20px;
            color: #666;
          }

          .countdown-values {
            display: flex;
            gap: 20px;
            justify-content: center;
          }

          .countdown-segment {
            display: flex;
            flex-direction: column;
            align-items: center;
            background: #ffffff;
            padding: 20px;
            border-radius: 6px;
            width: 160px;
            border: 1px solid #e0dce5;
            box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #e0dce5;
          }

          .countdown-number {
            font-size: 64px;
            font-weight: bold;
            color: #2b2233;
            min-width: 100px;
            text-align: center;
          }

          .countdown-label {
            font-size: 16px;
            color: #666;
            text-transform: uppercase;
            margin-top: 5px;
          }
        `}</style>
      </div>
    );
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
  }))
)(Login);
