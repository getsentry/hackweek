import React, {Component} from 'react';
import PropTypes from 'prop-types';

import Gravatar from 'react-gravatar';

export default class Avatar extends Component {
  static propTypes = {
    user: PropTypes.object,
    size: PropTypes.number,
  };

  static defaultProps = {
    size: 16,
  };

  render() {
    let {user} = this.props;
    return (
      <Gravatar
        email={user && user.email}
        size={this.props.size}
        default="monsterid"
        className="avatar"
      />
    );
  }
}
