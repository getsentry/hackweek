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
    return (
      <div className="App">
        <header className="App-header">
          <h1 className="App-title">#HACKWEEK</h1>
          {profile && <img src={profile.avatarUrl} width={32} />}
          {auth && <p>Logged in as {auth.email}</p>}
        </header>
        <div className="App-intro">
          <LoginRequired>
            <ProjectList {...this.props} />
          </LoginRequired>
        </div>
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
