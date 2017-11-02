import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {
  firebaseConnect,
  helpers,
  pathToJS,
  isLoaded,
  isEmpty,
} from 'react-redux-firebase';

class LoginRequired extends Component {
  static propTypes = {
    auth: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  componentWillReceiveProps({auth}) {
    if (auth && !auth.uid) {
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
  }))
)(LoginRequired);
