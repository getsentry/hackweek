import React from 'react';
import {Link} from 'react-router';
import PropTypes from 'prop-types';
import {slugify} from '../utils';

// function YearMetrics({members, projectCount}) {
//   if (!members.length && !projectCount) return null;
//   return (
//     <div className="Year-section">
//       <p>
//         {members.length} participant{members.length !== 1 ? 's' : ''}, {projectCount}{' '}
//         project{projectCount !== 1 ? 's' : ''}
//       </p>
//     </div>
//   );
// }

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
      <div className="Year-metrics">
        <Link to={`/years/${year}/projects`} className="Year-metrics-link">
          <h2>{year}</h2> <span className="glyphicon glyphicon-circle-arrow-right" />
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
      <hr className="squiggle-line" />
    </li>
  );
}

YearListItem.propTypes = {
  year: PropTypes.string.isRequired,
  yearData: PropTypes.object.isRequired,
  userList: PropTypes.object.isRequired,
};
