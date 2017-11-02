import React, {Component} from 'react';
import PropTypes from 'prop-types';
import GoogleButton from 'react-google-button';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, isEmpty, pathToJS} from 'react-redux-firebase';

class LoginRequired extends Component {
  static propTypes = {
    firebase: PropTypes.shape({
      login: PropTypes.func.isRequired,
    }),
  };

  state = {
    isLoading: false,
  };

  googleLogin = loginData => {
    this.setState({isLoading: true});
    return this.props.firebase
      .login({provider: 'google'})
      .then(() => {
        this.setState({isLoading: false});
      })
      .catch(error => {
        this.setState({isLoading: false});
      });
  };

  render() {
    const {auth} = this.props;

    if (!isLoaded(auth)) {
      return (
        <div className="loading-indicator">
          <span>Loading</span>
        </div>
      );
    }

    if (isEmpty(auth)) {
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

    return this.props.children;
  }
}

export default compose(
  firebaseConnect(),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
  }))
)(LoginRequired);
