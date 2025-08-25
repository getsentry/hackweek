import React from 'react';
import PropTypes from 'prop-types';

const VoteAnalytics = ({
  data,
  awardCategories,
  projects,
  uniqueVotersCount,
  totalEmployees,
}) => {
  // Calculate total votes cast across all categories
  const totalVotesCast = Object.values(data).reduce((total, categoryVotes) => {
    return total + Object.values(categoryVotes).reduce((sum, votes) => sum + votes, 0);
  }, 0);

  // Calculate total possible votes (each employee gets 5 votes)
  const totalPossibleVotes = totalEmployees * 5;

  // Calculate participation percentage based on unique voters vs total employees
  const participationPercentage =
    totalEmployees > 0 ? ((uniqueVotersCount / totalEmployees) * 100).toFixed(1) : 0;

  // Calculate average votes per participant
  const averageVotesPerParticipant =
    uniqueVotersCount > 0 ? (totalVotesCast / uniqueVotersCount).toFixed(1) : 0;

  // Calculate voting completion rate (votes cast vs possible votes)
  const votingCompletionRate =
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
          <div className="analytics-value">{uniqueVotersCount}</div>
          <div className="analytics-label">
            Active Voters
            <div className="analytics-subtext">
              {uniqueVotersCount} of {totalEmployees} employees
            </div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-value">{participationPercentage}%</div>
          <div className="analytics-label">
            Participation Rate
            <div className="analytics-subtext">
              Employees who have cast at least one vote
            </div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-value">{totalVotesCast}</div>
          <div className="analytics-label">
            Total Votes Cast
            <div className="analytics-subtext">
              {averageVotesPerParticipant} avg per participant
            </div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-value">{votingCompletionRate}%</div>
          <div className="analytics-label">
            Voting Completion
            <div className="analytics-subtext">
              {totalVotesCast} of {totalPossibleVotes} possible votes
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
  uniqueVotersCount: PropTypes.number.isRequired,
  totalEmployees: PropTypes.number.isRequired,
};

export default VoteAnalytics;
