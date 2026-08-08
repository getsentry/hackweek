import {useState} from 'react';
import {Link, useParams} from 'wouter';

import {GroupManager} from '../components/GroupManager';
import {ProjectCard} from '../components/ProjectCard';
import {PageState, QueryState} from '../components/AppLayout';
import {useProjects, useYear} from '../queries/projects';

type ProjectsView = 'grid' | 'list';

const PROJECTS_VIEW_STORAGE_KEY = 'hackweek.projectsView';

function getProjectsView(): ProjectsView {
  try {
    return window.localStorage.getItem(PROJECTS_VIEW_STORAGE_KEY) === 'list'
      ? 'list'
      : 'grid';
  } catch {
    return 'grid';
  }
}

function saveProjectsView(view: ProjectsView) {
  try {
    window.localStorage.setItem(PROJECTS_VIEW_STORAGE_KEY, view);
  } catch {
    return;
  }
}

export function ProjectsPage({isAdmin = false}: {isAdmin?: boolean}) {
  const {yearId} = useParams<{yearId: string}>();
  const [kind, setKind] = useState<'project' | 'idea'>('project');
  const [group, setGroup] = useState('');
  const [view, setView] = useState<ProjectsView>(getProjectsView);
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
          <header className="projectsHero pageHeader">
            <div>
              <Link className="backLink" href="/years">
                ← archives
              </Link>
              <p className="kicker">Hackweek {year.data.year.id}</p>
              <h1>projects &amp; ideas</h1>
              <p>
                {year.data.year.submissionsClosed
                  ? 'browse the finished projects, teams, and award winners.'
                  : 'see what everyone is building, join a team, or share an idea.'}
              </p>
            </div>
            <div className="heroActions">
              <Link className="textAction" href={`/years/${yearId}/watch`}>
                watch reel
              </Link>
              <Link className="textAction" href={`/years/${yearId}/vote`}>
                vote
              </Link>
              {isAdmin && (
                <Link className="textAction" href={`/admin/years/${yearId}`}>
                  manage year
                </Link>
              )}
              {!year.data.year.submissionsClosed && (
                <Link className="primaryAction" href={`/years/${yearId}/projects/new`}>
                  add project <span>+</span>
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
            <div className="projectControlActions">
              {kind === 'project' && year.data.groups.length > 0 && (
                <label>
                  <span>Group</span>
                  <select
                    value={group}
                    onChange={(event) => setGroup(event.target.value)}
                  >
                    <option value="">All groups</option>
                    {year.data.groups.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} ({item.projectCount})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="projectViewToggle" role="group" aria-label="Project view">
                {(['grid', 'list'] as const).map((option) => (
                  <button
                    type="button"
                    aria-label={`${option} view`}
                    aria-pressed={view === option}
                    key={option}
                    onClick={() => {
                      setView(option);
                      saveProjectsView(option);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
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
              <p>try another group or add the first {kind} for this Hackweek.</p>
            </section>
          ) : (
            <section
              className={view === 'grid' ? 'projectGrid' : 'projectList'}
              aria-label={`${kind} list`}
            >
              {projects.data.projects.map((project) => (
                <ProjectCard project={project} view={view} key={project.id} />
              ))}
            </section>
          )}
        </main>
      )}
    </QueryState>
  );
}
