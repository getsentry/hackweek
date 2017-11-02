import React, {Component} from 'react';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, pathToJS} from 'react-redux-firebase';

import LoginRequired from '../LoginRequired';

import {currentYear} from '../config';

class Layout extends Component {
  render() {
    let {auth, profile} = this.props;
    return (
      <LoginRequired>
        <header className="App-header">
          <h1 className="App-title">
            #HACKWEEK <small>{currentYear}</small>
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
    profile: pathToJS(firebase, 'profile'),
    auth: pathToJS(firebase, 'auth'),
  }))
)(Layout);
