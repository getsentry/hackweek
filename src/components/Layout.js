import React, {Component} from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, pathToJS} from 'react-redux-firebase';

import {currentYear} from '../config';
import LoginRequired from '../LoginRequired';

class Layout extends Component {
  static propTypes = {
    auth: PropTypes.object,
    profile: PropTypes.object,
    firebase: PropTypes.shape({
      logout: PropTypes.func.isRequired,
    }),
  };

  render() {
    let {auth, profile} = this.props;

    return (
      <LoginRequired>
        <header className="App-header">
          <h1 className="App-title">
            <Link to="/">#HACKWEEK</Link> <small>{currentYear}</small>
          </h1>
          <div className="App-auth">
            <div className="App-avatar">
              {profile && <img src={profile.avatarUrl} alt="avatar" />}
            </div>
            <div className="App-email">{auth && <p>Logged in as {auth.email}</p>}</div>
          </div>
        </header>
        <div className="App-main">{this.props.children}</div>
      </LoginRequired>
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
