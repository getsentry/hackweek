import {Link} from 'wouter';

import type {ProjectSummary} from '../../shared/projects';
import {Markdown} from './Markdown';

interface ProjectListMember {
  id: string;
  displayName: string;
}

export function ProjectCard({
  project,
  view = 'grid',
  voteCategories = [],
}: {
  project: ProjectSummary;
  view?: 'grid' | 'list';
  voteCategories?: string[];
}) {
  const projectLink = `/years/${project.yearId}/projects/${project.id}`;

  if (view === 'list') {
    return (
      <ProjectListItem
        name={project.name}
        href={projectLink}
        kind={project.kind}
        groupName={project.group?.name ?? 'ungrouped'}
        members={project.members}
        needsHelp={project.needsHelp}
        hasVideo={project.hasVideo}
        voteCategories={voteCategories}
      />
    );
  }

  return (
    <article className={`projectCard projectCard--${project.kind}`}>
      <ProjectTags project={project} className="cardMeta" />
      <h2>
        <Link href={projectLink}>{project.name}</Link>
      </h2>
      <Markdown compact>{project.summary}</Markdown>
      <footer>
        <MemberStack members={project.members} />
        <ProjectVoteBadge categories={voteCategories} />
      </footer>
    </article>
  );
}

export function ProjectListItem({
  name,
  href,
  onSelect,
  actionLabel,
  kind = 'project',
  groupName,
  detail,
  members,
  needsHelp = false,
  hasVideo = false,
  emptyMemberLabel = 'up for grabs',
  voteCategories = [],
}: {
  name: string;
  href?: string;
  onSelect?: () => void;
  actionLabel?: string;
  kind?: ProjectSummary['kind'];
  groupName: string;
  detail?: string;
  members: ProjectListMember[];
  needsHelp?: boolean;
  hasVideo?: boolean;
  emptyMemberLabel?: string;
  voteCategories?: string[];
}) {
  return (
    <article className={`projectRow projectRow--${kind}`}>
      <h2>
        {href ? (
          <Link href={href}>{name}</Link>
        ) : (
          <button
            type="button"
            className="projectRowTitle"
            aria-label={actionLabel}
            onClick={onSelect}
          >
            {name}
          </button>
        )}
      </h2>
      <div className="projectRowTags">
        <span className="tag tag--group">{groupName}</span>
        {detail && <span className="tag">{detail}</span>}
        <ProjectVideoTag hasVideo={hasVideo} />
        <ProjectVoteBadge categories={voteCategories} />
        {needsHelp && <strong className="tag tag--help">looking for help</strong>}
      </div>
      <MemberStack members={members} emptyLabel={emptyMemberLabel} />
    </article>
  );
}

function ProjectVoteBadge({categories}: {categories: string[]}) {
  if (!categories.length) return null;
  const count = categories.length;
  return (
    <strong
      className="projectVoteBadge"
      aria-label={`${count} of your ${count === 1 ? 'pick' : 'picks'}: ${categories.join(', ')}`}
      title={categories.join(', ')}
    >
      your picks · {count}
    </strong>
  );
}

function ProjectTags({project, className}: {project: ProjectSummary; className: string}) {
  return (
    <div className={className}>
      <span className="tag tag--group">
        {project.kind === 'idea' ? 'open idea' : (project.group?.name ?? 'ungrouped')}
      </span>
      <ProjectVideoTag hasVideo={project.hasVideo} />
      {project.needsHelp && <strong className="tag tag--help">looking for help</strong>}
    </div>
  );
}

function ProjectVideoTag({hasVideo}: {hasVideo: boolean}) {
  return hasVideo ? <strong className="tag tag--video">has video</strong> : null;
}

function MemberStack({
  members,
  emptyLabel = 'up for grabs',
}: {
  members: ProjectListMember[];
  emptyLabel?: string;
}) {
  if (!members.length) return <span className="openSeat">{emptyLabel}</span>;
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
