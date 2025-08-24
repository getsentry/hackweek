import React, {useState} from 'react';
import PropTypes from 'prop-types';

const VoteTable = ({data, awardCategories, projects, year}) => {
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'desc',
  });

  // Set the first category as default active
  const [activeCategory, setActiveCategory] = useState(() => {
    const firstCategoryKey = Object.keys(awardCategories)[0];
    return firstCategoryKey || null;
  });

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
  const handleSort = (key) => {
    // If clicking the same column, toggle between showing all vs top 5
    if (activeCategory === key) {
      setActiveCategory(null);
      setSortConfig({key: null, direction: 'desc'});
      return;
    }

    // Set new active category and show top 5 for that category
    setActiveCategory(key);
    setSortConfig({
      key,
      direction: 'desc',
    });
  };

  // Filter data based on active category
  const getFilteredData = () => {
    // Always show all projects
    const allProjects = Object.keys(projects).map((projectKey) => {
      const project = projects[projectKey];
      const row = {projectKey, projectName: project.name};

      // Calculate total votes for this project
      let totalVotes = 0;
      Object.keys(awardCategories).forEach((categoryKey) => {
        const votes = data[categoryKey]?.[projectKey] || 0;
        row[categoryKey] = votes;
        totalVotes += votes;
      });

      row.totalVotes = totalVotes;
      return row;
    });

    return allProjects;
  };

  const getSortedData = () => {
    let sortableData = getFilteredData();

    if (activeCategory) {
      // Sort by the active category or total votes (highest to lowest)
      sortableData.sort((a, b) => {
        if (activeCategory === 'totalVotes') {
          return (b.totalVotes || 0) - (a.totalVotes || 0);
        }
        return (b[activeCategory] || 0) - (a[activeCategory] || 0);
      });
    }

    return sortableData;
  };

  // Get sort indicator
  const getSortIndicator = (key) => {
    if (activeCategory === key) {
      return ' ↓'; // Show down arrow for active category (sorted highest to lowest)
    }
    return '';
  };

  const getHeaderClassName = (key) => {
    let className = 'vote-table-header';
    if (activeCategory === key) {
      className += ' active-category';
    }
    return className;
  };

  // Calculate category totals for summary row
  const categoryTotals = Object.keys(awardCategories).map((categoryKey) => {
    const categoryVotes = data[categoryKey] || {};
    return Object.values(categoryVotes).reduce((sum, votes) => sum + votes, 0);
  });

  // Calculate grand total
  const grandTotal = categoryTotals.reduce((sum, total) => sum + total, 0);

  const sortedData = getSortedData();

  return (
    <div className="vote-table-container">
      <h3>Vote Summary by Category</h3>
      <div className="vote-table-wrapper">
        <table className="vote-table">
          <thead>
            <tr>
              <th className="rank-column">Rank</th>
              <th>Project</th>
              {Object.keys(awardCategories).map((categoryKey) => (
                <th
                  key={categoryKey}
                  onClick={() => handleSort(categoryKey)}
                  className={getHeaderClassName(categoryKey)}
                >
                  {awardCategories[categoryKey].name}
                </th>
              ))}
              <th
                onClick={() => handleSort('totalVotes')}
                className={getHeaderClassName('totalVotes')}
              >
                Totals
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Category totals row */}
            <tr className="category-totals-row">
              <td></td> {/* Empty cell for rank column */}
              <td>
                <strong>Category Totals</strong>
              </td>
              {Object.keys(awardCategories).map((categoryKey) => {
                const categoryVotes = Object.values(data[categoryKey] || {}).reduce(
                  (sum, votes) => sum + votes,
                  0
                );
                return (
                  <td
                    key={categoryKey}
                    className="vote-count"
                    data-category-active={
                      activeCategory === categoryKey ? 'true' : 'false'
                    }
                  >
                    <strong>{categoryVotes}</strong>
                  </td>
                );
              })}
              <td
                className="total-votes"
                data-category-active={activeCategory === 'totalVotes' ? 'true' : 'false'}
              >
                <strong>{grandTotal}</strong>
              </td>
            </tr>
            {sortedData.map((row, index) => (
              <tr key={row.projectKey}>
                <td className="rank-column">{index + 1}</td>
                <td className="project-name">
                  <a
                    href={`/years/${year}/projects/${row.projectKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row.projectName}
                  </a>
                </td>
                {Object.keys(awardCategories).map((categoryKey) => (
                  <td
                    key={categoryKey}
                    className="vote-count"
                    data-category-active={
                      activeCategory === categoryKey ? 'true' : 'false'
                    }
                  >
                    {row[categoryKey] || 0}
                  </td>
                ))}
                <td
                  className="total-votes"
                  data-category-active={
                    activeCategory === 'totalVotes' ? 'true' : 'false'
                  }
                >
                  {row.totalVotes}
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
