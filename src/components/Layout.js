import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, pathToJS} from 'react-redux-firebase';

import {currentYear} from '../config';
import Avatar from './Avatar';

class Layout extends Component {
  static propTypes = {
    auth: PropTypes.object,
    profile: PropTypes.object,
    firebase: PropTypes.shape({
      logout: PropTypes.func.isRequired,
    }),
  };

  componentDidUpdate() {
    let {auth, profile} = this.props;
    window.Sentry &&
      window.Sentry.configureScope(scope => {
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
    let {auth, profile} = this.props;

    return (
      <div>
        <header className="App-header">
          <h1 className="App-title">
            <Link to="/">#HACKWEEK</Link>
          </h1>
          <div className="App-auth">
            <div className="App-avatar">
              {auth && (
                <a onClick={this.props.firebase.logout}>
                  <Avatar user={profile} />
                </a>
              )}
            </div>
            <div className="App-email">
              {auth && (
                <p>
                  Logged in as
                  <br />
                  {auth.email}
                </p>
              )}
            </div>
          </div>
        </header>
        <div className="App-main">{this.props.children}</div>
        <div className="App-footer">
          <Link to="/projects">This Year ({currentYear})</Link>
          <Link to="/years">The Archives</Link>
          {profile && profile.admin && <Link to="/admin">Admin</Link>}
        </div>
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
