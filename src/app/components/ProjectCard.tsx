import {Link} from 'wouter';

import type {ProjectSummary} from '../../shared/projects';

export function ProjectCard({project}: {project: ProjectSummary}) {
  return (
    <article className={`projectCard projectCard--${project.kind}`}>
      <div className="cardMeta">
        <span className="tag tag--group">
          {project.kind === 'idea' ? 'open idea' : (project.group?.name ?? 'ungrouped')}
        </span>
        {project.needsHelp && <strong className="tag tag--help">looking for help</strong>}
      </div>
      <h2>
        <Link href={`/years/${project.yearId}/projects/${project.id}`}>
          {project.name}
        </Link>
      </h2>
      <p>{project.summary}</p>
      <footer>
        <MemberStack members={project.members} />
        <span>
          {project.mediaCount} {project.mediaCount === 1 ? 'attachment' : 'attachments'}
        </span>
      </footer>
    </article>
  );
}

function MemberStack({members}: {members: ProjectSummary['members']}) {
  if (!members.length) return <span className="openSeat">up for grabs</span>;
  return (
    <span
      className="memberStack"
      aria-label={members.map(({displayName}) => displayName).join(', ')}
    >
      {members.slice(0, 4).map((member) => (
        <span key={member.id} title={member.displayName}>
          {initials(member.displayName)}
        </span>
      ))}
      {members.length > 4 && <span>+{members.length - 4}</span>}
    </span>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
