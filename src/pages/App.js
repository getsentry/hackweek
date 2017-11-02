import React, {Component} from 'react';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, pathToJS} from 'react-redux-firebase';

import './App.css';

import {currentYear} from '../config';
import LoginRequired from '../LoginRequired';

class App extends Component {
  render() {
    let {auth, profile} = this.props;
    return <div className="App">{this.props.children}</div>;
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    profile: pathToJS(firebase, 'profile'),
    auth: pathToJS(firebase, 'auth'),
  }))
)(App);
