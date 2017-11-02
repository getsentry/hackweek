import React from 'react';
import PropTypes from 'prop-types';
import {compose} from 'redux';
import {connect} from 'react-redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';

export const loginRequired = ComposedComponent => {
  class Authenticate extends React.Component {
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
      return <ComposedComponent {...this.props} />;
    }
  }

  return compose(
    firebaseConnect(),
    connect(({firebase}) => ({
      auth: pathToJS(firebase, 'auth'),
      authError: pathToJS(firebase, 'authError'),
    }))
  )(Authenticate);
};
