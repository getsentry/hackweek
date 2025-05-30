import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {Link} from 'react-router';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';
import * as Sentry from '@sentry/react';
import Header from './header';
import FooterSection from './FooterSection';

import {currentYear} from '../config';
import Avatar from './Avatar';

class Layout extends Component {
  static propTypes = {
    children: PropTypes.node,
    firebase: PropTypes.shape({
      login: PropTypes.func.isRequired,
      logout: PropTypes.func.isRequired,
    }),
    auth: PropTypes.object,
    profile: PropTypes.object,
  };

  handleLogin = () => {
    return this.props.firebase
      .login({provider: 'google', type: 'popup'})
      .catch((error) => {
        console.error(error);
        Sentry.captureException(error);
      });
  };

  handleLogout = () => {
    return this.props.firebase.logout().catch((error) => {
      console.error(error);
      Sentry.captureException(error);
    });
  };

  componentDidUpdate() {
    let {auth, profile} = this.props;
    Sentry.configureScope((scope) => {
      scope.setUser(
        !!auth && !!profile
          ? {
              id: auth.uid,
              email: auth.email,
              isAdmin: profile.admin,
            }
          : {}
      );
    });
  }

  render() {
    const {auth, profile, children} = this.props;

    return (
      <div className="app-layout">
        <Header
          onLogin={this.handleLogin}
          onLogout={this.handleLogout}
          isAuthenticated={isLoaded(auth) && !isEmpty(auth)}
          user={profile}
        />
        <main>{children}</main>
        <FooterSection currentYear={currentYear} profile={profile} />
      </div>
    );
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    profile: pathToJS(firebase, 'profile'),
  }))
)(Layout);
