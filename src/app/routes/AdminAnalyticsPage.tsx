import {useState} from 'react';
import {Link, useSearch} from 'wouter';

import type {VoteResult} from '../../shared/administration';
import {
  analyticsProjectExportFilename,
  analyticsYearExportFilename,
} from '../../shared/analytics-export';
import {QueryState} from '../components/AppLayout';
import {UserAvatar} from '../components/UserAvatar';
import {ApiError, apiResponseError} from '../queries/api';
import {useAnalytics} from '../queries/administration';

export function AdminAnalyticsPage() {
  const yearId = new URLSearchParams(useSearch()).get('year') ?? undefined;
  const query = useAnalytics(yearId);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'years' | 'projects' | null>(null);

  async function downloadCsv(scope: 'years' | 'projects') {
    if (exporting) return;
    if (scope === 'projects' && !yearId) return;
    setExporting(scope);
    setExportError(null);
    try {
      const path =
        scope === 'years'
          ? '/api/admin/analytics/export'
          : `/api/admin/analytics/export?year=${encodeURIComponent(yearId!)}`;
      const response = await fetch(path);
      if (!response.ok) throw await apiResponseError(response);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download =
        scope === 'years'
          ? analyticsYearExportFilename()
          : analyticsProjectExportFilename(yearId!);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? error.message
          : 'Analytics CSV could not be downloaded',
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="operationsPage">
      <Link className="backLink" href={yearId ? `/admin/years/${yearId}` : '/years'}>
        ← admin
      </Link>
      <header className="operationsHero pageHeader">
        <div>
          <p className="kicker">Hackweek analytics</p>
          <h1>participation</h1>
        </div>
        <div className="analyticsHeroActions">
          <p>
            D1 computes these totals server-side. Export year metrics for retros, or a
            year&apos;s projects (with optional ready-video fields) for ceremony and
            harvest work.
          </p>
          <div className="analyticsExportActions">
            <button
              type="button"
              className="primaryAction"
              disabled={exporting !== null || query.isLoading}
              onClick={() => {
                void downloadCsv('years');
              }}
            >
              {exporting === 'years' ? 'Exporting…' : 'Export year metrics CSV'}
            </button>
            {yearId && (
              <button
                type="button"
                className="textAction"
                disabled={exporting !== null || query.isLoading}
                onClick={() => {
                  void downloadCsv('projects');
                }}
              >
                {exporting === 'projects'
                  ? 'Exporting…'
                  : `Export ${yearId} projects CSV`}
              </button>
            )}
          </div>
          {exportError && <p className="formError">{exportError}</p>}
        </div>
      </header>
      <QueryState loading={query.isLoading} error={query.error}>
        {query.data && (
          <>
            <section className="metricGrid">
              {query.data.years.map((year) => (
                <article key={year.yearId}>
                  <strong>{year.yearId}</strong>
                  <dl>
                    <div>
                      <dt>Active voters</dt>
                      <dd>{year.activeVoters}</dd>
                    </div>
                    <div>
                      <dt>Votes</dt>
                      <dd>{year.voteCount}</dd>
                    </div>
                    <div>
                      <dt>Projects</dt>
                      <dd>{year.projectCount}</dd>
                    </div>
                    <div>
                      <dt>Ideas</dt>
                      <dd>{year.ideaCount}</dd>
                    </div>
                    <div>
                      <dt>Awards</dt>
                      <dd>{year.awardCount}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </section>
            {yearId && (
              <AwardStandings yearId={yearId} results={query.data.voteResults} />
            )}
          </>
        )}
      </QueryState>
    </main>
  );
}

function AwardStandings({yearId, results}: {yearId: string; results: VoteResult[]}) {
  const categories = groupByCategory(results);

  return (
    <section className="awardStandings">
      <header className="awardStandingsHeader">
        <div>
          <p className="kicker">{yearId} vote distribution</p>
          <h2>Award standings</h2>
        </div>
        <p>The leading project and two runners-up in every category.</p>
      </header>
      {!categories.length ? (
        <p className="awardStandingsEmpty">No votes have been recorded.</p>
      ) : (
        <div className="awardSections">
          {categories.map(
            ({categoryId, categoryName, results: categoryResults}, index) => {
              const [leader, ...runnerUps] = rankResults(categoryResults).slice(0, 3);
              const totalVotes = categoryResults.reduce(
                (total, result) => total + result.voteCount,
                0,
              );

              return (
                <article className="awardSection" key={categoryId}>
                  <header className="awardSectionHeader">
                    <div className="awardNumber" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <p>Award category</p>
                      <h3>{categoryName}</h3>
                    </div>
                    <p className="awardTally">
                      <strong>{totalVotes}</strong> {voteLabel(totalVotes)}
                      <span aria-hidden="true">·</span>
                      <strong>{categoryResults.length}</strong>{' '}
                      {categoryResults.length === 1 ? 'project' : 'projects'}
                    </p>
                  </header>
                  <div className="awardPodium">
                    <section className="awardWinner">
                      <div className="awardPlacement">
                        <span aria-hidden="true">★</span>
                        {leader.tied ? 'Tied for lead' : 'Winner by votes'}
                      </div>
                      <div className="awardProjectCopy">
                        <ProjectOrigin groupName={leader.groupName} />
                        <h4>
                          <Link href={`/years/${yearId}/projects/${leader.projectId}`}>
                            {leader.projectName}
                          </Link>
                        </h4>
                        <ProjectTeam members={leader.members} />
                      </div>
                      <VoteCount count={leader.voteCount} />
                    </section>
                    <section className="awardRunnerUps">
                      <h4>Runners-up</h4>
                      {runnerUps.length ? (
                        <ol>
                          {runnerUps.map((result) => (
                            <li key={result.projectId}>
                              <span className="awardRunnerRank">
                                {String(result.rank).padStart(2, '0')}
                              </span>
                              <div>
                                <strong>
                                  <Link
                                    href={`/years/${yearId}/projects/${result.projectId}`}
                                  >
                                    {result.projectName}
                                  </Link>
                                </strong>
                                <ProjectOrigin groupName={result.groupName} />
                                {result.tied && (
                                  <small className="awardTie">
                                    {tieLabel(result.rank)}
                                  </small>
                                )}
                                <ProjectTeam members={result.members} />
                              </div>
                              <VoteCount count={result.voteCount} />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="awardRunnerUpsEmpty">No runner-ups yet.</p>
                      )}
                    </section>
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}

function ProjectOrigin({groupName}: {groupName: string | null}) {
  return (
    <p className="awardOrigin">
      <span>From</span> {groupName ?? 'an independent team'}
    </p>
  );
}

function ProjectTeam({members}: {members: VoteResult['members']}) {
  if (!members.length) return <p className="awardTeamEmpty">Team not listed</p>;

  return (
    <ul className="awardTeam" aria-label="Project team">
      {members.map((member) => (
        <li key={member.id}>
          <Link
            href={`/users/${member.id}`}
            aria-label={`View ${member.displayName}'s Hackweek profile`}
          >
            <UserAvatar user={member} />
            <span>{member.displayName}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function VoteCount({count}: {count: number}) {
  return (
    <p className="awardVoteCount" aria-label={`${count} ${voteLabel(count)}`}>
      <strong>{count}</strong>
      <span>{voteLabel(count)}</span>
    </p>
  );
}

function groupByCategory(results: VoteResult[]) {
  const categories = new Map<
    string,
    {categoryId: string; categoryName: string; results: VoteResult[]}
  >();

  for (const result of results) {
    const category = categories.get(result.categoryId) ?? {
      categoryId: result.categoryId,
      categoryName: result.categoryName,
      results: [],
    };
    category.results.push(result);
    categories.set(result.categoryId, category);
  }

  return [...categories.values()].map((category) => ({
    ...category,
    results: [...category.results].sort(
      (left, right) =>
        right.voteCount - left.voteCount ||
        left.projectName.localeCompare(right.projectName),
    ),
  }));
}

function rankResults(results: VoteResult[]) {
  let rank = 0;

  return results.map((result, index) => {
    if (index === 0 || result.voteCount !== results[index - 1].voteCount) {
      rank = index + 1;
    }
    const tied =
      results[index - 1]?.voteCount === result.voteCount ||
      results[index + 1]?.voteCount === result.voteCount;
    return {...result, rank, tied};
  });
}

function tieLabel(rank: number) {
  if (rank === 1) return 'Tied for lead';
  return `Tied for ${ordinal(rank)}`;
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function voteLabel(count: number) {
  return count === 1 ? 'vote' : 'votes';
}
