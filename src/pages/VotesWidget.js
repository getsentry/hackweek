import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS} from 'react-redux-firebase';

import {currentYear} from '../config';
import {orderedPopulatedDataToJS} from '../helpers';
import './VotesWidget.css';

class VotedCheckmark extends Component {
  render() {
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M22.2807 7.99323L10.2432 20.0307C10.1736 20.1005 10.0909 20.1558 9.99983 20.1935C9.90878 20.2313 9.81118 20.2507 9.71262 20.2507C9.61406 20.2507 9.51646 20.2313 9.42542 20.1935C9.33437 20.1558 9.25165 20.1005 9.182 20.0307L2.4695 13.2807C2.32895 13.1401 2.25 12.9494 2.25 12.7506C2.25 12.5517 2.32895 12.3611 2.4695 12.2204L4.7195 9.97041C4.78915 9.90068 4.87187 9.84536 4.96292 9.80762C5.05396 9.76988 5.15156 9.75045 5.25012 9.75045C5.34868 9.75045 5.44628 9.76988 5.53733 9.80762C5.62837 9.84536 5.71109 9.90068 5.78075 9.97041L9.75012 13.8217L18.9695 4.71948C19.0392 4.64974 19.1219 4.59443 19.2129 4.55668C19.304 4.51894 19.4016 4.49951 19.5001 4.49951C19.5987 4.49951 19.6963 4.51894 19.7873 4.55668C19.8784 4.59443 19.9611 4.64974 20.0307 4.71948L22.2807 6.93198C22.3505 7.00163 22.4058 7.08435 22.4435 7.1754C22.4813 7.26644 22.5007 7.36404 22.5007 7.4626C22.5007 7.56116 22.4813 7.65876 22.4435 7.74981C22.4058 7.84086 22.3505 7.92357 22.2807 7.99323Z"
          fill="#7553FF"
        />
        <path
          d="M22.8075 6.39756L20.5575 4.18881C20.2763 3.90858 19.8955 3.75122 19.4986 3.75122C19.1016 3.75122 18.7208 3.90858 18.4397 4.18881L9.74997 12.7716L6.31028 9.43412C6.02854 9.1548 5.64761 8.99846 5.25088 8.99934C4.85414 9.00022 4.47391 9.15824 4.19341 9.43881L1.94341 11.6888C1.6626 11.97 1.50488 12.3512 1.50488 12.7487C1.50488 13.1461 1.6626 13.5273 1.94341 13.8085L8.65778 20.5585C8.79707 20.6978 8.96245 20.8083 9.14446 20.8837C9.32647 20.9591 9.52155 20.998 9.71856 20.998C9.91558 20.998 10.1107 20.9591 10.2927 20.8837C10.4747 20.8083 10.6401 20.6978 10.7793 20.5585L22.8122 8.52287C22.9517 8.3832 23.0624 8.21735 23.1377 8.03483C23.213 7.8523 23.2516 7.6567 23.2512 7.45924C23.2507 7.26178 23.2113 7.06635 23.1352 6.88416C23.059 6.70198 22.9477 6.53661 22.8075 6.39756ZM9.71434 19.5001L2.99997 12.7501L5.24997 10.5001C5.2527 10.5023 5.25521 10.5048 5.25747 10.5076L9.22778 14.3597C9.36794 14.4969 9.55623 14.5737 9.75231 14.5737C9.9484 14.5737 10.1367 14.4969 10.2768 14.3597L19.5056 5.25006L21.75 7.46256L9.71434 19.5001Z"
          fill="#7553FF"
        />
      </svg>
    );
  }
}

class VotesWidget extends Component {
  static propTypes = {
    auth: PropTypes.object,
    year: PropTypes.object,
    awardCategories: PropTypes.object,
    allProjects: PropTypes.object,
  };

  constructor(props) {
    super(props);

    this.state = {
      open: false,
    };
  }

  togglePanel() {
    this.setState({open: !this.state.open});
  }

  render() {
    const {auth, year, awardCategories, allProjects} = this.props;

    if (!isLoaded(auth) || !auth?.uid) {
      return null;
    }

    if (!isLoaded(year) || !year?.votingEnabled) {
      return null;
    }

    if (!isLoaded(awardCategories) || !isLoaded(allProjects)) {
      return null;
    }

    const categories = Object.keys(awardCategories || {})
      .map((key) => ({
        ...awardCategories[key],
        key,
      }))
      .sort((a, b) => ('' + a.name).localeCompare(b.name));

    const currentUserId = auth.uid;
    const ownVotes = Object.keys(year.votes || {})
      .filter((key) => key.startsWith(currentUserId))
      .map((key) => {
        const vote = year.votes[key];
        return {
          category: vote.awardCategory,
          project: vote.project,
        };
      });

    const votedProjects = {};
    ownVotes.forEach((vote) => {
      let foundProject = null;

      if (allProjects?.[vote.project]) {
        foundProject = allProjects[vote.project];
      } else if (allProjects) {
        foundProject = Object.values(allProjects).find((p) => p.key === vote.project);
      }

      if (foundProject) {
        votedProjects[vote.project] = foundProject;
      }
    });

    const votedCategoriesMap = {};
    ownVotes.forEach((vote) => {
      votedCategoriesMap[vote.category] = vote;
    });

    const totalCategories = categories.length;
    const votedCategories = new Set(ownVotes.map((vote) => vote.category));
    const remainingVotes = totalCategories - votedCategories.size;

    return (
      <div className="VotesWidget-wrapper" data-open={this.state.open}>
        <button onClick={this.togglePanel.bind(this)} className="VotesWidget-button">
          <span>
            {remainingVotes}/{totalCategories} votes left
          </span>
          <span className="VotesWidget-caret" />
        </button>
        <div className="VotesWidget-container">
          <ul className="VotesWidget-list">
            {categories.map((category) => {
              const hasVoted = votedCategoriesMap[category.key];
              return (
                <li key={category.key}>
                  {hasVoted ? (
                    <>
                      <VotedCheckmark />
                      {category.name}
                      <a href={`/projects/${hasVoted.project}`}>
                        {votedProjects[hasVoted.project]?.name || 'Unknown Project'}
                      </a>
                    </>
                  ) : (
                    <>
                      <span className="VotesWidget-notvoted" />
                      {category.name}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];
const projectPopulates = [{child: 'creator', root: 'users', keyProp: 'key'}];

// Simple wrapper that first checks if voting is enabled before loading everything
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

    // Only now load the full widget with all data
    return <VotesWidgetConnected />;
  }
}

const VotesWidgetConnected = compose(
  firebaseConnect(() => [
    {
      path: `/years/${currentYear}/awardCategories`,
      queryParams: ['orderByChild=name'],
      storeAs: 'votesWidgetAwardCategories',
    },
    {
      path: `/years/${currentYear}/projects`,
      queryParams: ['orderByChild=name'],
      populates: projectPopulates,
      storeAs: 'votesWidgetAllProjects',
    },
  ]),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    year: orderedPopulatedDataToJS(firebase, 'votesWidgetYear'),
    awardCategories: orderedPopulatedDataToJS(firebase, 'votesWidgetAwardCategories'),
    allProjects: orderedPopulatedDataToJS(
      firebase,
      'votesWidgetAllProjects',
      projectPopulates
    ),
  }))
)(VotesWidget);

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
