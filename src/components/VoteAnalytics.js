import React from 'react';
import PropTypes from 'prop-types';

const VoteAnalytics = ({data, awardCategories, projects, userCount}) => {
  // Calculate total votes cast across all categories
  const totalVotesCast = Object.values(data).reduce((total, categoryVotes) => {
    return total + Object.values(categoryVotes).reduce((sum, votes) => sum + votes, 0);
  }, 0);

  // Calculate total possible votes (each user gets 5 votes)
  const totalPossibleVotes = userCount * 5;

  // Calculate participation percentage
  const participationPercentage =
    totalPossibleVotes > 0 ? ((totalVotesCast / totalPossibleVotes) * 100).toFixed(1) : 0;

  // Calculate votes per category
  const votesPerCategory = Object.keys(awardCategories)
    .map((categoryKey) => {
      const categoryVotes = data[categoryKey] || {};
      const total = Object.values(categoryVotes).reduce((sum, votes) => sum + votes, 0);
      return {
        name: awardCategories[categoryKey].name,
        total,
        key: categoryKey,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Find most active category
  const mostActiveCategory = votesPerCategory[0];

  return (
    <div className="vote-analytics-container">
      <h3>Vote Analytics Dashboard</h3>
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-value">{totalVotesCast}</div>
          <div className="analytics-label">Total Votes Cast</div>
        </div>

        <div className="analytics-card">
          <div className="analytics-value">{participationPercentage}%</div>
          <div className="analytics-label">
            Participation Rate
            <div className="analytics-subtext">
              {totalVotesCast} / {totalPossibleVotes} possible votes
            </div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-value">{mostActiveCategory?.total || 0}</div>
          <div className="analytics-label">
            Most Active Category
            <div className="analytics-subtext">{mostActiveCategory?.name || 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

VoteAnalytics.propTypes = {
  data: PropTypes.object.isRequired,
  awardCategories: PropTypes.object.isRequired,
  projects: PropTypes.object.isRequired,
  userCount: PropTypes.number.isRequired,
};

export default VoteAnalytics;
