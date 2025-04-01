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
      <div className="login-container">
        <Button priority="default" size="md" onClick={() => console.log('Disco time!')}>
          Disco!
        </Button>
        <CountdownTimer />
        <div className="login-box">
          <p>Sign in to access Hackweek</p>
          <Button
            priority="default"
            size="md"
            onClick={this.googleLogin}
            icon={<GoogleIcon />}
            iconPosition="left"
            style={{minWidth: '240px'}}
          >
            Sign in with Google
          </Button>
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
          .login-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
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

          .login-box {
            background: #ffffff;
            padding: 30px;
            border-radius: 6px;
            text-align: center;
            border: 1px solid #e0dce5;
            box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #e0dce5;
          }

          .login-box p {
            margin-bottom: 20px;
            font-size: 18px;
            color: #2b2233;
          }

          .google-button-wrapper {
            position: relative;
            display: inline-block;
          }

          .google-button-wrapper button {
            position: relative;
            font-weight: 600 !important;
            height: 50px !important;
            border-radius: 10px !important;
            transition: all 0.1s ease-in-out !important;
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1) !important;
          }

          .google-button-wrapper button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2), 0 8px 16px rgba(0, 0, 0, 0.1) !important;
          }

          .google-button-wrapper button:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
          }

          .google-button-wrapper button > div {
            padding: 0 20px !important;
          }

          .google-button-wrapper button > span {
            font-size: 16px !important;
            padding-left: 24px !important;
            font-weight: 600 !important;
          }

          .google-button-wrapper::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 10px;
            pointer-events: none;
            transition: all 0.2s ease;
          }

          .google-button-wrapper:focus-within::after {
            box-shadow: 0 0 0 2px #4ecdc4;
          }

          .disco-button {
            position: relative;
            display: inline-block;
            padding: 10px 16px;
            font-size: 16px;
            font-weight: 600;
            color: #ffffff;
            background: #6c5fc7;
            border: 1px solid #6c5fc7;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.1s ease;
            margin-bottom: 20px;
            box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #584ac0;
          }

          .disco-button:hover {
            background: #584ac0;
            border-color: #584ac0;
            transform: translateY(-1px);
            box-shadow: 0 4px 24px rgba(43, 34, 51, 0.12), 0 3px 0 0 #4a3da1;
          }

          .disco-button:active {
            transform: translateY(2px);
            background: #584ac0;
            box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04) inset, 0 0 0 0 #4a3da1;
          }

          .disco-button:focus {
            outline: none;
            box-shadow: #6c5fc7 0 0 0 1px, rgba(108, 95, 199, 0.5) 0 0 0 4px,
              0 3px 0 0 #584ac0;
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
