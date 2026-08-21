import {useEffect, useRef, useState} from 'react';
import {Link, useParams, useSearchParams} from 'wouter';

import type {BallotStatusResponse} from '../../shared/administration';
import {getAwardCategoryDescription} from '../awardCategories';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [kind, setKind] = useState<'project' | 'idea'>('project');
  const group = searchParams.get('group') ?? '';
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [view, setView] = useState<ProjectsView>(getProjectsView);
  const resultStart = useRef<HTMLElement | null>(null);
  const paginationRequestPending = useRef(false);
  const year = useYear(yearId);
  const ballot = useBallotStatus(yearId, year.data?.year.votingEnabled ?? false);
  const projects = useProjects(
    yearId,
    kind,
    kind === 'project' ? group || undefined : undefined,
    search || undefined,
    cursor,
  );
  const error = year.error ?? projects.error;
  const voteCategoriesByProject = selectedCategoriesByProject(ballot.data);
  const pageProjects = projects.data?.projects ?? [];
  const nextCursor = projects.data?.nextCursor ?? null;
  const pageOffset = cursor ? Number(cursor) : 0;
  const pageStart = pageOffset + 1;
  const pageEnd = pageOffset + pageProjects.length;
  const showPagination = Boolean(cursor || nextCursor);
  const pageStatus = projects.isPlaceholderData
    ? 'loading page…'
    : pageProjects.length
      ? `showing ${pageStart}–${pageEnd}${nextCursor ? '+' : ''}`
      : `no ${kind === 'idea' ? 'ideas' : 'projects'} found on this page`;

  const resetPagination = () => {
    paginationRequestPending.current = false;
    setCursor(undefined);
    setCursorHistory([]);
  };

  const selectGroup = (groupId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (groupId) next.set('group', groupId);
      else next.delete('group');
      return next;
    });
    resetPagination();
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    resetPagination();
  }, [yearId, search, group]);

  useEffect(() => {
    if (
      !paginationRequestPending.current ||
      projects.isFetching ||
      projects.isPlaceholderData
    ) {
      return;
    }
    paginationRequestPending.current = false;
    resultStart.current?.focus();
  }, [cursor, projects.isFetching, projects.isPlaceholderData]);

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
                onChange={(event) => {
                  paginationRequestPending.current = false;
                  setSearchInput(event.target.value);
                }}
              />
              {search && (
                <button
                  type="button"
                  className="textAction"
                  onClick={() => {
                    resetPagination();
                    setSearchInput('');
                    setSearch('');
                  }}
                >
                  clear
                </button>
              )}
              {projects.isFetching && (
                <span
                  className="projectSearchStatus"
                  role={showPagination ? undefined : 'status'}
                >
                  updating…
                </span>
              )}
            </div>
          </div>
          <section className="projectControls" aria-label="Project filters">
            <div className="segmented">
              <button
                className={kind === 'project' ? 'active' : ''}
                onClick={() => {
                  setKind('project');
                  resetPagination();
                }}
              >
                Projects <span>{year.data.year.projectCount}</span>
              </button>
              <button
                className={kind === 'idea' ? 'active' : ''}
                onClick={() => {
                  setKind('idea');
                  resetPagination();
                }}
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
                    onChange={(event) => selectGroup(event.target.value)}
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
                    href={`/years/${yearId}/projects/${award.projectId}${group ? `?group=${encodeURIComponent(group)}` : ''}`}
                  >
                    <span>{award.categoryName}</span>
                    <small>{getAwardCategoryDescription(award.categoryName)}</small>
                    <strong>{award.projectName}</strong>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {!pageProjects.length ? (
            <section
              className="emptyState"
              aria-label={`${kind} results`}
              ref={resultStart}
              tabIndex={-1}
            >
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
              ref={resultStart}
              tabIndex={-1}
            >
              {pageProjects.map((project) => (
                <ProjectCard
                  project={project}
                  view={view}
                  voteCategories={voteCategoriesByProject.get(project.id)}
                  detailsSearch={group ? `group=${encodeURIComponent(group)}` : undefined}
                  key={project.id}
                />
              ))}
            </section>
          )}
          {showPagination && (
            <nav className="projectPagination" aria-label="Project pages">
              <p role="status">{pageStatus}</p>
              <div>
                <button
                  type="button"
                  className="textAction"
                  disabled={cursorHistory.length === 0 || projects.isFetching}
                  onClick={() => {
                    const previous = cursorHistory[cursorHistory.length - 1];
                    paginationRequestPending.current = true;
                    setCursorHistory((history) => history.slice(0, -1));
                    setCursor(previous);
                  }}
                >
                  previous
                </button>
                <button
                  type="button"
                  className="textAction"
                  disabled={!nextCursor || projects.isFetching}
                  onClick={() => {
                    if (!nextCursor) return;
                    paginationRequestPending.current = true;
                    setCursorHistory((history) => [...history, cursor]);
                    setCursor(nextCursor);
                  }}
                >
                  next
                </button>
              </div>
            </nav>
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
    if (!categoryName || !vote.projectActive || !vote.nominationEligible) continue;
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
  const castCount = selections.filter(
    ({vote}) => vote.projectActive && vote.nominationEligible,
  ).length;
  const inactiveCount = selections.filter(({vote}) => !vote.projectActive).length;
  const ineligibleCount = selections.filter(
    ({vote}) => vote.projectActive && !vote.nominationEligible,
  ).length;
  const remainingCount = Math.max(categoryCount - castCount, 0);
  const complete = categoryCount > 0 && remainingCount === 0;
  let message = 'open a project to cast your first vote.';
  if (categoryCount === 0) {
    message = 'award categories are still being set up. check back soon.';
  } else if (complete) {
    message = 'ballot complete — every category has your pick.';
  } else if (inactiveCount > 0 || ineligibleCount > 0) {
    const invalidPicks = [
      inactiveCount > 0
        ? `${inactiveCount} withdrawn ${inactiveCount === 1 ? 'pick' : 'picks'}`
        : null,
      ineligibleCount > 0
        ? `${ineligibleCount} ineligible ${ineligibleCount === 1 ? 'pick' : 'picks'}`
        : null,
    ].filter((value): value is string => Boolean(value));
    const invalidCount = inactiveCount + ineligibleCount;
    message = `${invalidPicks.join(' and ')} ${invalidCount === 1 ? 'needs' : 'need'} a new project — ${remainingCount} ${remainingCount === 1 ? 'vote' : 'votes'} left to cast.`;
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
                <span className="ballotCategoryCopy">
                  <strong>{category.name}</strong>
                  <small>{getAwardCategoryDescription(category.name)}</small>
                </span>
                {vote.projectActive && vote.nominationEligible ? (
                  <Link href={`/years/${yearId}/projects/${vote.projectId}`}>
                    {vote.projectName} <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <span
                    className={`ballotSelectionInactive${vote.projectActive ? ' ballotSelectionInactive--ineligible' : ''}`}
                  >
                    <strong>{vote.projectName}</strong>
                    <small>
                      {vote.projectActive
                        ? 'project team did not enter this award — choose another project'
                        : 'project withdrawn — choose another project'}
                    </small>
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
