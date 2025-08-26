import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {firebaseConnect, isLoaded, pathToJS, dataToJS} from 'react-redux-firebase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import {orderedPopulatedDataToJS} from '../helpers';
import './AdminAnalytics.css';

// Define the years we want to analyze (hackweek has been running since 2017)
const YEARS_TO_ANALYZE = [
  '2017',
  '2018',
  '2019',
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
];

class AdminAnalytics extends Component {
  static propTypes = {
    auth: PropTypes.object,
    votes2017: PropTypes.object,
    votes2018: PropTypes.object,
    votes2019: PropTypes.object,
    votes2020: PropTypes.object,
    votes2021: PropTypes.object,
    votes2022: PropTypes.object,
    votes2023: PropTypes.object,
    votes2024: PropTypes.object,
    votes2025: PropTypes.object,
    projects2017: PropTypes.object,
    projects2018: PropTypes.object,
    projects2019: PropTypes.object,
    projects2020: PropTypes.object,
    projects2021: PropTypes.object,
    projects2022: PropTypes.object,
    projects2023: PropTypes.object,
    projects2024: PropTypes.object,
    projects2025: PropTypes.object,
  };

  static contextTypes = {
    router: PropTypes.object.isRequired,
  };

  processChartData = () => {
    const {
      votes2017,
      votes2018,
      votes2019,
      votes2020,
      votes2021,
      votes2022,
      votes2023,
      votes2024,
      votes2025,
      projects2017,
      projects2018,
      projects2019,
      projects2020,
      projects2021,
      projects2022,
      projects2023,
      projects2024,
      projects2025,
    } = this.props;

    const yearVotesMap = {
      2017: votes2017,
      2018: votes2018,
      2019: votes2019,
      2020: votes2020,
      2021: votes2021,
      2022: votes2022,
      2023: votes2023,
      2024: votes2024,
      2025: votes2025,
    };

    const yearProjectsMap = {
      2017: projects2017,
      2018: projects2018,
      2019: projects2019,
      2020: projects2020,
      2021: projects2021,
      2022: projects2022,
      2023: projects2023,
      2024: projects2024,
      2025: projects2025,
    };

    return YEARS_TO_ANALYZE.map((year) => {
      const yearVotes = yearVotesMap[year] || {};
      const yearProjects = yearProjectsMap[year] || {};
      const uniqueVoters = new Set();

      // Count unique voters for this year
      if (Array.isArray(yearVotes)) {
        yearVotes.forEach((vote) => {
          if (vote && vote.creator) {
            uniqueVoters.add(vote.creator);
          }
        });
      } else if (yearVotes && typeof yearVotes === 'object') {
        Object.values(yearVotes).forEach((vote) => {
          if (vote && vote.creator) {
            uniqueVoters.add(vote.creator);
          }
        });
      }

      // Count projects for this year
      let projectCount = 0;
      if (Array.isArray(yearProjects)) {
        projectCount = yearProjects.length;
      } else if (yearProjects && typeof yearProjects === 'object') {
        projectCount = Object.keys(yearProjects).length;
      }

      return {
        year: year,
        activeVoters: uniqueVoters.size,
        projectCount: projectCount,
      };
    });
  };

  render() {
    const {auth} = this.props;

    if (!isLoaded(auth)) {
      return <div className="loading-indicator">Loading...</div>;
    }

    const chartData = this.processChartData();

    return (
      <div className="admin-analytics">
        <div className="chart-wrapper" style={{width: '100%', height: '400px'}}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 20,
                right: 45,
                left: 10,
                bottom: 20,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{fontSize: 12}} interval={0} />
              <YAxis
                yAxisId="left"
                tick={{fontSize: 12}}
                label={{value: 'Active Voters', angle: -90, position: 'insideLeft'}}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{fontSize: 12}}
                label={{value: 'Projects', angle: 90, position: 'insideRight'}}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'activeVoters') return [value, 'Active Voters'];
                  if (name === 'projectCount') return [value, 'Projects'];
                  return [value, name];
                }}
                labelFormatter={(label) => `Year: ${label}`}
              />
              <Legend
                formatter={(value) => {
                  if (value === 'activeVoters') return 'Active Voters';
                  if (value === 'projectCount') return 'Projects';
                  return value;
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="activeVoters"
                stroke="#8884d8"
                strokeWidth={3}
                dot={{fill: '#8884d8', strokeWidth: 2, r: 3}}
                activeDot={{r: 8, stroke: '#8884d8', strokeWidth: 2}}
                name="activeVoters"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="projectCount"
                stroke="#82ca9d"
                strokeWidth={3}
                dot={{fill: '#82ca9d', strokeWidth: 2, r: 3}}
                activeDot={{r: 8, stroke: '#82ca9d', strokeWidth: 2}}
                name="projectCount"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Stats */}
        <div>
          <h3>Summary</h3>
          <div className="summary-grid">
            <div className="summary-card">
              <h4>Total Years</h4>
              <div className="summary-value">{chartData.length}</div>
            </div>
            <div className="summary-card">
              <h4>Peak Participation</h4>
              <div className="summary-value">
                {chartData.reduce(
                  (max, item) =>
                    item.activeVoters > (max.activeVoters || 0) ? item : max,
                  {}
                ).year || 'N/A'}
              </div>
              <div className="summary-subtext">
                {chartData.reduce(
                  (max, item) =>
                    item.activeVoters > (max.activeVoters || 0) ? item : max,
                  {}
                ).activeVoters || 0}{' '}
                voters
              </div>
            </div>
            <div className="summary-card">
              <h4>Most Projects</h4>
              <div className="summary-value">
                {chartData.reduce(
                  (max, item) =>
                    item.projectCount > (max.projectCount || 0) ? item : max,
                  {}
                ).year || 'N/A'}
              </div>
              <div className="summary-subtext">
                {chartData.reduce(
                  (max, item) =>
                    item.projectCount > (max.projectCount || 0) ? item : max,
                  {}
                ).projectCount || 0}{' '}
                projects
              </div>
            </div>
            <div className="summary-card">
              <h4>Current Year (2025)</h4>
              <div className="summary-value">
                {chartData[chartData.length - 1]?.activeVoters || 0}
              </div>
              <div className="summary-subtext">
                {chartData[chartData.length - 1]?.projectCount || 0} projects
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const keyPopulates = [{keyProp: 'key'}];

export default compose(
  firebaseConnect(() => {
    const connections = [
      {
        path: `/years`,
        storeAs: 'yearList',
      },
    ];

    // Add connections for each year we want to analyze
    YEARS_TO_ANALYZE.forEach((year) => {
      // Add votes data
      connections.push({
        path: `/years/${year}/votes`,
        populates: keyPopulates,
        storeAs: `votes_${year}`,
      });

      // Add projects data
      connections.push({
        path: `/years/${year}/projects`,
        populates: keyPopulates,
        storeAs: `projects_${year}`,
      });
    });

    return connections;
  }),
  connect(({firebase}) => ({
    auth: pathToJS(firebase, 'auth'),
    yearList: dataToJS(firebase, 'yearList'),
    votes2017: orderedPopulatedDataToJS(firebase, 'votes_2017', keyPopulates),
    votes2018: orderedPopulatedDataToJS(firebase, 'votes_2018', keyPopulates),
    votes2019: orderedPopulatedDataToJS(firebase, 'votes_2019', keyPopulates),
    votes2020: orderedPopulatedDataToJS(firebase, 'votes_2020', keyPopulates),
    votes2021: orderedPopulatedDataToJS(firebase, 'votes_2021', keyPopulates),
    votes2022: orderedPopulatedDataToJS(firebase, 'votes_2022', keyPopulates),
    votes2023: orderedPopulatedDataToJS(firebase, 'votes_2023', keyPopulates),
    votes2024: orderedPopulatedDataToJS(firebase, 'votes_2024', keyPopulates),
    votes2025: orderedPopulatedDataToJS(firebase, 'votes_2025', keyPopulates),
    projects2017: orderedPopulatedDataToJS(firebase, 'projects_2017', keyPopulates),
    projects2018: orderedPopulatedDataToJS(firebase, 'projects_2018', keyPopulates),
    projects2019: orderedPopulatedDataToJS(firebase, 'projects_2019', keyPopulates),
    projects2020: orderedPopulatedDataToJS(firebase, 'projects_2020', keyPopulates),
    projects2021: orderedPopulatedDataToJS(firebase, 'projects_2021', keyPopulates),
    projects2022: orderedPopulatedDataToJS(firebase, 'projects_2022', keyPopulates),
    projects2023: orderedPopulatedDataToJS(firebase, 'projects_2023', keyPopulates),
    projects2024: orderedPopulatedDataToJS(firebase, 'projects_2024', keyPopulates),
    projects2025: orderedPopulatedDataToJS(firebase, 'projects_2025', keyPopulates),
  }))
)(AdminAnalytics);
