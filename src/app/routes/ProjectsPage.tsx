import {useState} from 'react';
import {Link, useParams} from 'wouter';

import {GroupManager} from '../components/GroupManager';
import {ProjectCard} from '../components/ProjectCard';
import {PageState, QueryState} from '../components/AppLayout';
import {useProjects, useYear} from '../queries/projects';

export function ProjectsPage({isAdmin = false}: {isAdmin?: boolean}) {
  const {yearId} = useParams<{yearId: string}>();
  const [kind, setKind] = useState<'project' | 'idea'>('project');
  const [group, setGroup] = useState('');
  const year = useYear(yearId);
  const projects = useProjects(yearId, kind, group || undefined);
  const error = year.error ?? projects.error;

  return (
    <QueryState loading={year.isLoading || projects.isLoading} error={error}>
      {!year.data ? (
        <PageState
          title="Year not found"
          detail="This archive entry does not exist."
          tone="error"
        />
      ) : (
        <main className="projectsPage">
          <header className="projectsHero">
            <div>
              <Link className="backLink" href="/years">
                ← Archives
              </Link>
              <p className="kicker">Field notes / {year.data.year.id}</p>
              <h1>Experiments in public</h1>
              <p>
                {year.data.year.submissionsClosed
                  ? 'A finished collection, preserved as the teams left it.'
                  : 'In progress. Rough edges and collaborators welcome.'}
              </p>
            </div>
            <div className="heroActions">
              <Link className="textAction" href={`/years/${yearId}/vote`}>
                Open ballot
              </Link>
              {isAdmin && (
                <Link className="textAction" href={`/admin/years/${yearId}`}>
                  Manage year
                </Link>
              )}
              {!year.data.year.submissionsClosed && (
                <Link className="primaryAction" href={`/years/${yearId}/projects/new`}>
                  Propose a project <span>↗</span>
                </Link>
              )}
            </div>
          </header>
          <section className="projectControls" aria-label="Project filters">
            <div className="segmented">
              <button
                className={kind === 'project' ? 'active' : ''}
                onClick={() => setKind('project')}
              >
                Projects <span>{year.data.year.projectCount}</span>
              </button>
              <button
                className={kind === 'idea' ? 'active' : ''}
                onClick={() => setKind('idea')}
              >
                Ideas <span>{year.data.year.ideaCount}</span>
              </button>
            </div>
            {kind === 'project' && year.data.groups.length > 0 && (
              <label>
                <span>Group</span>
                <select value={group} onChange={(event) => setGroup(event.target.value)}>
                  <option value="">All groups</option>
                  {year.data.groups.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} ({item.projectCount})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
          {isAdmin && <GroupManager yearId={yearId} groups={year.data.groups} />}
          {year.data.awards.length > 0 && (
            <section className="awardStrip" aria-label="Awards">
              <p className="kicker">Award roll</p>
              <div>
                {year.data.awards.map((award) => (
                  <Link
                    key={award.id}
                    href={`/years/${yearId}/projects/${award.projectId}`}
                  >
                    <span>{award.categoryName}</span>
                    <strong>{award.projectName}</strong>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {!projects.data?.projects.length ? (
            <section className="emptyState">
              <span>∅</span>
              <h2>No {kind === 'idea' ? 'ideas' : 'projects'} found</h2>
              <p>
                Try another group or be the first to put something strange on the board.
              </p>
            </section>
          ) : (
            <section className="projectGrid" aria-label={`${kind} list`}>
              {projects.data.projects.map((project) => (
                <ProjectCard project={project} key={project.id} />
              ))}
            </section>
          )}
        </main>
      )}
    </QueryState>
  );
}
