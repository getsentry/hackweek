import {useEffect, useState} from 'react';
import {Link, useParams} from 'wouter';

import type {BallotStatusResponse} from '../../shared/administration';
import {GroupManager} from '../components/GroupManager';
import {ProjectCard} from '../components/ProjectCard';
import {PageState, QueryState} from '../components/AppLayout';
import {useBallotStatus} from '../queries/administration';
import {useProjects, useYear} from '../queries/projects';

type ProjectsView = 'grid' | 'list';

const PROJECTS_VIEW_STORAGE_KEY = 'hackweek.projectsView';
const SEARCH_DEBOUNCE_MS = 300;

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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ProjectsView>(getProjectsView);
  const year = useYear(yearId);
  const ballot = useBallotStatus(yearId, year.data?.year.votingEnabled ?? false);
  const projects = useProjects(
    yearId,
    kind,
    kind === 'project' ? group || undefined : undefined,
    search || undefined,
  );
  const error = year.error ?? projects.error;
  const voteCategoriesByProject = selectedCategoriesByProject(ballot.data);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

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
                ← hackweek
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
              {(isAdmin || year.data.year.submissionsClosed) && (
                <Link className="textAction" href={`/years/${yearId}/watch`}>
                  watch reel
                </Link>
              )}
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
          {year.data.year.votingEnabled && (
            <BallotOverview
              yearId={yearId}
              data={ballot.data}
              error={ballot.error}
              loading={ballot.isLoading}
            />
          )}
          <div
            className="projectSearch"
            role="search"
            aria-label="Search projects and ideas"
          >
            <label htmlFor="project-search">Search projects and ideas</label>
            <div>
              <input
                id="project-search"
                type="search"
                value={searchInput}
                maxLength={100}
                placeholder="Search titles and descriptions"
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="textAction"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                  }}
                >
                  clear
                </button>
              )}
              {projects.isFetching && (
                <span className="projectSearchStatus" role="status">
                  updating…
                </span>
              )}
            </div>
          </div>
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
              <p>
                {search
                  ? 'try another search or adjust the filters.'
                  : `try another group or add the first ${kind} for this Hackweek.`}
              </p>
            </section>
          ) : (
            <section
              className={view === 'grid' ? 'projectGrid' : 'projectList'}
              aria-label={`${kind} list`}
            >
              {projects.data.projects.map((project) => (
                <ProjectCard
                  project={project}
                  view={view}
                  voteCategories={voteCategoriesByProject.get(project.id)}
                  key={project.id}
                />
              ))}
            </section>
          )}
        </main>
      )}
    </QueryState>
  );
}

function selectedCategoriesByProject(ballot?: BallotStatusResponse) {
  const result = new Map<string, string[]>();
  if (!ballot) return result;
  const categoryNames = new Map(
    ballot.categories.map((category) => [category.id, category.name]),
  );
  for (const vote of ballot.votes) {
    const categoryName = categoryNames.get(vote.categoryId);
    if (!categoryName || !vote.projectActive) continue;
    const categories = result.get(vote.projectId) ?? [];
    categories.push(categoryName);
    result.set(vote.projectId, categories);
  }
  return result;
}

function BallotOverview({
  yearId,
  data,
  error,
  loading,
}: {
  yearId: string;
  data?: BallotStatusResponse;
  error: Error | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="ballotOverview ballotOverview--notice" aria-busy="true">
        <div>
          <p className="kicker">your ballot</p>
          <h2>counting your picks…</h2>
        </div>
        <p>you can keep browsing while your progress loads.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ballotOverview ballotOverview--notice" role="status">
        <div>
          <p className="kicker">your ballot</p>
          <h2>progress is taking a break</h2>
        </div>
        <p>we couldn't load your picks, but every project is still here to explore.</p>
      </section>
    );
  }

  if (!data?.year.votingEnabled) return null;

  const selections = data.categories.flatMap((category) => {
    const vote = data.votes.find((item) => item.categoryId === category.id);
    return vote ? [{category, vote}] : [];
  });
  const categoryCount = data.categories.length;
  const castCount = data.votes.length;
  const remainingCount = Math.max(categoryCount - castCount, 0);
  const complete = categoryCount > 0 && remainingCount === 0;
  let message = 'open a project to cast your first vote.';
  if (categoryCount === 0) {
    message = 'award categories are still being set up. check back soon.';
  } else if (complete) {
    message = 'ballot complete — every category has your pick.';
  } else if (castCount > 0) {
    message = `keep exploring — ${remainingCount} ${remainingCount === 1 ? 'vote' : 'votes'} left to cast.`;
  }

  return (
    <section className="ballotOverview" aria-labelledby="ballot-overview-title">
      <div className="ballotOverviewProgress">
        <p className="kicker">voting is open</p>
        <h2 id="ballot-overview-title">your ballot</h2>
        <p>{message}</p>
        <div className="ballotCounts" aria-label="Ballot counts">
          <strong>
            {castCount} <span>{castCount === 1 ? 'vote' : 'votes'} cast</span>
          </strong>
          <strong>
            {remainingCount}{' '}
            <span>{remainingCount === 1 ? 'vote' : 'votes'} remaining</span>
          </strong>
        </div>
        <progress aria-label="ballot progress" max={categoryCount || 1} value={castCount}>
          {castCount} of {categoryCount}
        </progress>
        <small>
          {castCount} of {categoryCount} categor{categoryCount === 1 ? 'y' : 'ies'}
        </small>
      </div>
      <div className="ballotSelections">
        <h3>{selections.length ? 'your picks so far' : 'where to begin'}</h3>
        {selections.length ? (
          <ul>
            {selections.map(({category, vote}) => (
              <li key={category.id}>
                <span>{category.name}</span>
                {vote.projectActive ? (
                  <Link href={`/years/${yearId}/projects/${vote.projectId}`}>
                    {vote.projectName} <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <span className="ballotSelectionInactive">
                    <strong>{vote.projectName}</strong>
                    <small>project withdrawn — choose another project</small>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {categoryCount
              ? 'open any project that catches your eye and choose a category there.'
              : 'once categories are ready, project pages will be the place to vote.'}
          </p>
        )}
      </div>
    </section>
  );
}
