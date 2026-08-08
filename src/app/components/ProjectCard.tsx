import {Link} from 'wouter';

import type {ProjectSummary} from '../../shared/projects';

export function ProjectCard({
  project,
  view = 'grid',
}: {
  project: ProjectSummary;
  view?: 'grid' | 'list';
}) {
  const projectLink = `/years/${project.yearId}/projects/${project.id}`;
  const attachmentCount = `${project.mediaCount} ${project.mediaCount === 1 ? 'attachment' : 'attachments'}`;

  if (view === 'list') {
    return (
      <article className={`projectRow projectRow--${project.kind}`}>
        <h2>
          <Link href={projectLink}>{project.name}</Link>
        </h2>
        <ProjectTags project={project} className="projectRowTags" />
        <MemberStack members={project.members} />
        <span className="projectRowAttachments">{attachmentCount}</span>
      </article>
    );
  }

  return (
    <article className={`projectCard projectCard--${project.kind}`}>
      <ProjectTags project={project} className="cardMeta" />
      <h2>
        <Link href={projectLink}>{project.name}</Link>
      </h2>
      <p title={project.summary}>{project.summary}</p>
      <footer>
        <MemberStack members={project.members} />
        <span>{attachmentCount}</span>
      </footer>
    </article>
  );
}

function ProjectTags({project, className}: {project: ProjectSummary; className: string}) {
  return (
    <div className={className}>
      <span className="tag tag--group">
        {project.kind === 'idea' ? 'open idea' : (project.group?.name ?? 'ungrouped')}
      </span>
      {project.needsHelp && <strong className="tag tag--help">looking for help</strong>}
    </div>
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
