import React from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import {slugify} from '../utils';
import year2022 from '../assets/images/banner/year-2022.png';
import year2023 from '../assets/images/banner/year-2023.png';
import year2024 from '../assets/images/banner/year-2024.png';

const yearImages = {
  2022: year2022,
  2023: year2023,
  2024: year2024,
  // add more as need
};

function YearAwardList({awards, awardCategories, projects, year}) {
  if (!awards.length) return null;
  return (
    <div className="Year-section">
      <h3 className="Year-award-list-title">Award Winners</h3>
      <ul className="Year-award-list">
        {awards
          .map((award) => [award, awardCategories[award.awardCategory]])
          .sort((a, b) => `${a[1].name}`.localeCompare(b[1].name))
          .filter(([award]) => award.project && projects[award.project])
          .map(([award, awardCategory]) => {
            const project = projects[award.project];
            return (
              <li className="Year-award-list-item" key={awardCategory.name}>
                <em>{awardCategory.name}</em> &mdash;{' '}
                <Link
                  className="no-forced-lowercase"
                  to={`/years/${year}/projects/${award.project}/${slugify(project.name)}`}
                >
                  {project.name}
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

export default function YearListItem({year, yearData, userList}) {
  const projects = yearData.projects || {};
  const awardCategories = yearData.awardCategories || {};
  const awardList = Object.values(yearData.awards || {});
  const allMembers = new Set();
  for (const project of Object.values(projects)) {
    for (const memberKey of Object.keys(project.members || {})) {
      allMembers.add(memberKey);
    }
  }
  const members = Array.from(allMembers)
    .map((k) => userList[k])
    .filter((m) => m !== null)
    .sort((a, b) => `${a.displayName}`.localeCompare(b.displayName));
  const projectCount = Object.keys(projects).length;

  return (
    <li className="Year">
      {yearImages[year] && <img src={yearImages[year]} alt={year} />}
      <div className="Year-metrics">
        <Link to={`/years/${year}/projects`} className="Year-metrics-link">
          <h2>{year}</h2>
        </Link>
        <p className="Year-metrics-text">
          {members.length} participant{members.length !== 1 ? 's' : ''}, {projectCount}{' '}
          project{projectCount !== 1 ? 's' : ''}
        </p>
      </div>
      <YearAwardList
        awards={awardList}
        awardCategories={awardCategories}
        projects={projects}
        year={year}
      />
    </li>
  );
}

YearListItem.propTypes = {
  year: PropTypes.string.isRequired,
  yearData: PropTypes.object.isRequired,
  userList: PropTypes.object.isRequired,
};
