import React, {useState} from 'react';
import PropTypes from 'prop-types';

const VoteTable = ({data, awardCategories, projects, year}) => {
  const [sortConfig, setSortConfig] = useState({column: 'total', direction: 'desc'});

  // Transform data for table display
  const tableData = Object.keys(projects).map((projectKey) => {
    const project = projects[projectKey];
    const row = {projectKey, project, total: 0};

    // Add vote counts for each category
    Object.keys(awardCategories).forEach((categoryKey) => {
      const categoryVotes = data[categoryKey] || {};
      const voteCount = categoryVotes[projectKey] || 0;
      row[categoryKey] = voteCount;
      row.total += voteCount;
    });

    return row;
  });

  // Sort function
  const sortData = (data, config) => {
    return [...data].sort((a, b) => {
      let aValue = config.column === 'project' ? a.project.name : a[config.column];
      let bValue = config.column === 'project' ? b.project.name : b[config.column];

      if (config.column === 'project') {
        return config.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (config.direction === 'asc') {
        return aValue - bValue;
      }
      return bValue - aValue;
    });
  };

  // Handle column sorting
  const handleSort = (column) => {
    setSortConfig((prevConfig) => ({
      column,
      direction:
        prevConfig.column === column && prevConfig.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Get sort indicator
  const getSortIndicator = (column) => {
    if (sortConfig.column !== column) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const sortedData = sortData(tableData, sortConfig);

  return (
    <div className="vote-table-container">
      <h3>Vote Summary Table</h3>
      <div className="vote-table-wrapper">
        <table className="vote-table">
          <thead>
            <tr>
              <th className="sortable-header" onClick={() => handleSort('project')}>
                Project Name {getSortIndicator('project')}
              </th>
              {Object.keys(awardCategories).map((categoryKey) => (
                <th
                  key={categoryKey}
                  className="sortable-header"
                  onClick={() => handleSort(categoryKey)}
                >
                  {awardCategories[categoryKey].name} {getSortIndicator(categoryKey)}
                </th>
              ))}
              <th className="sortable-header" onClick={() => handleSort('total')}>
                Total Votes {getSortIndicator('total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map(({projectKey, project, total, ...categoryVotes}) => (
              <tr key={projectKey}>
                <td className="project-name">
                  <a
                    href={`/years/${year}/projects/${projectKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {project.name}
                  </a>
                </td>
                {Object.keys(awardCategories).map((categoryKey) => (
                  <td key={categoryKey} className="vote-count">
                    {categoryVotes[categoryKey] || 0}
                  </td>
                ))}
                <td className="total-votes">
                  <strong>{total}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

VoteTable.propTypes = {
  data: PropTypes.object.isRequired,
  awardCategories: PropTypes.object.isRequired,
  projects: PropTypes.object.isRequired,
  year: PropTypes.string.isRequired,
};

export default VoteTable;
