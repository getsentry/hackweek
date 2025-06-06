// import React from 'react';
// import {Link} from 'react-router';
// import Avatar from '../components/Avatar';
// import {slugify} from '../utils';

// function YearMemberList({members}) {
//   if (!members.length) return null;
//   return (
//     <div className="Year-section">
//       <ul className="Year-member-list">
//         {members.map((member) => (
//           <li key={member.email} title={member.displayName}>
//             <Avatar user={member} />
//           </li>
//         ))}
//       </ul>
//     </div>
//   );
// }

// function YearAwardList({awards, awardCategories, projects, year}) {
//   if (!awards.length) return null;
//   return (
//     <div className="Year-section">
//       <h3>Award Winners</h3>
//       <ul className="Year-award-list">
//         {awards
//           .map((award) => [award, awardCategories[award.awardCategory]])
//           .sort((a, b) => `${a[1].name}`.localeCompare(b[1].name))
//           .filter(([award]) => award.project && projects[award.project])
//           .map(([award, awardCategory]) => {
//             const project = projects[award.project];
//             return (
//               <li key={awardCategory.name}>
//                 <em>{awardCategory.name}</em> &mdash;{' '}
//                 <Link
//                   to={`/years/${year}/projects/${award.project}/${slugify(project.name)}`}
//                 >
//                   {project.name}
//                 </Link>
//               </li>
//             );
//           })}
//       </ul>
//     </div>
//   );
// }

// export default function YearListItem({year, yearData, userList}) {
//   const projects = yearData.projects || {};
//   const awardCategories = yearData.awardCategories || {};
//   const awardList = Object.values(yearData.awards || {});
//   let allMembers = new Set();
//   Object.values(projects).forEach((project) => {
//     Object.keys(project.members || {}).forEach((memberKey) => {
//       allMembers.add(memberKey);
//     });
//   });
//   const members = Array.from(allMembers)
//     .map((k) => userList[k])
//     .filter((m) => m !== null)
//     .sort((a, b) => `${a.displayName}`.localeCompare(b.displayName));

//   return (
//     <li className="Year">
//       <div className="Year-name">
//         <Link to={`/years/${year}/projects`}>
//           {year} <span className="glyphicon glyphicon-circle-arrow-right" /> HELLO
//         </Link>
//       </div>
//       <YearMemberList members={members} />
//       <YearAwardList
//         awards={awardList}
//         awardCategories={awardCategories}
//         projects={projects}
//         year={year}
//       />
//     </li>
//   );
// }
