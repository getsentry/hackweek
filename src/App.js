import React, {Component} from 'react';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, pathToJS} from 'react-redux-firebase';

import './App.css';

import LoginRequired from './Login';
import ProjectList from './ProjectList';

class App extends Component {
  render() {
    let {auth, profile} = this.props;
    console.log(profile);
    return (
      <div className="App">
        <LoginRequired>
          <header className="App-header">
            <h1 className="App-title">#HACKWEEK</h1>
            <div className="App-auth">
              <div className="App-avatar">
                {profile && <img src={profile.avatarUrl} alt="avatar" />}
              </div>
              <div className="App-email">{auth && <p>Logged in as {auth.email}</p>}</div>
            </div>
          </header>
          <div className="App-intro">
            <ProjectList {...this.props} />
          </div>
        </LoginRequired>
      </div>
    );
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    profile: pathToJS(firebase, 'profile'),
    auth: pathToJS(firebase, 'auth'),
  }))
)(App);
