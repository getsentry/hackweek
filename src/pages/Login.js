import React, {Component} from 'react';
import PropTypes from 'prop-types';
import GoogleButton from 'react-google-button';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isEmpty, isLoaded, pathToJS} from 'react-redux-firebase';

class Login extends Component {
  static propTypes = {
    firebase: PropTypes.shape({
      login: PropTypes.func.isRequired,
    }),
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  googleLogin = loginData => {
    return this.props.firebase
      .login({provider: 'google', type: 'popup'})
      .then(() => {
        this.context.router.push('/');
      })
      .catch(error => {});
  };

  componentWillReceiveProps({auth}) {
    if (isLoaded(auth) && !isEmpty(auth)) {
      this.context.router.push('/');
    }
  }
  render() {
    const {auth} = this.props;

    if (!isLoaded(auth)) {
      return (
        <div className="loading-indicator">
          <span>Loading</span>
        </div>
      );
    }

    return (
      <div className="Modal" style={{width: 400}}>
        <div style={{textAlign: 'center'}}>
          <p>You'll need to login to continue.</p>
          <div style={{display: 'inline-block'}}>
            <GoogleButton onClick={this.googleLogin} />
          </div>
        </div>
      </div>
    );
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
  }))
)(Login);
