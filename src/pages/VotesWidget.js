import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {Link} from 'react-router';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import {currentYear} from '../config';
import {orderedPopulatedDataToJS} from '../helpers';
import {getAuthUserVotes} from '../voting';
import './VotesWidget.css';

class VotesWidgetWrapper extends Component {
  static propTypes = {
    auth: PropTypes.object,
    year: PropTypes.object,
  };

  render() {
    const {auth, year} = this.props;

    // Don't render anything if user is not authenticated
    if (!isLoaded(auth) || !auth?.uid) {
      return null;
    }

    // Don't render if year data is not loaded yet
    if (!isLoaded(year)) {
      return null;
    }

    // Don't render if voting is not enabled
    if (!year?.votingEnabled) {
      return null;
    }

    const totalCategories = Object.keys(year.awardCategories || {}).length;
    const votedCategories = new Set(
      getAuthUserVotes(auth.uid, year.votes).map((vote) => vote.awardCategory)
    );
    const remainingVotes = totalCategories - votedCategories.size;

    return (
      <div className="VotesWidget-wrapper">
        <Link to={`/years/${currentYear}/voting`} className="VotesWidget-button">
          {remainingVotes}/{totalCategories} votes left
        </Link>
      </div>
    );
  }
}

export default compose(
  firebaseConnect(() => [
    {
      path: `/years/${currentYear}`,
      storeAs: 'votesWidgetYear',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    year: orderedPopulatedDataToJS(firebase, 'votesWidgetYear'),
  }))
)(VotesWidgetWrapper);
