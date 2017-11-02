import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';

class LoginRequired extends Component {
  static propTypes = {
    auth: PropTypes.object,
    authError: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  componentWillReceiveProps({auth}) {
    if (isLoaded(auth) && isEmpty(auth)) {
      this.context.router.push('/login'); // redirect to /login if not authed
    }
  }

  render() {
    return this.props.children;
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    authError: pathToJS(firebase, 'authError'),
  }))
)(LoginRequired);
