import {Link, useSearch} from 'wouter';

import {QueryState} from '../components/AppLayout';
import {useAnalytics} from '../queries/administration';

export function AdminAnalyticsPage() {
  const yearId = new URLSearchParams(useSearch()).get('year') ?? undefined;
  const query = useAnalytics(yearId);
  return (
    <main className="operationsPage">
      <Link className="backLink" href={yearId ? `/admin/years/${yearId}` : '/years'}>
        ← Control room
      </Link>
      <header className="operationsHero">
        <div>
          <p className="kicker">Aggregate report</p>
          <h1>Participation, counted.</h1>
        </div>
        <p>
          D1 computes these totals server-side. No raw historical database is sent to this
          page.
        </p>
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
                      <dt>Awards</dt>
                      <dd>{year.awardCount}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </section>
            {yearId && (
              <section className="resultsTable">
                <p className="kicker">{yearId} vote distribution</p>
                <h2>Category results</h2>
                {!query.data.voteResults.length ? (
                  <p>No votes have been recorded.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Project</th>
                        <th>Group</th>
                        <th>Votes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.voteResults.map((row) => (
                        <tr key={`${row.categoryId}:${row.projectId}`}>
                          <td>{row.categoryName}</td>
                          <td>{row.projectName}</td>
                          <td>{row.groupName ?? '—'}</td>
                          <td>{row.voteCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </>
        )}
      </QueryState>
    </main>
  );
}
