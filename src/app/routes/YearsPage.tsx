import {Link} from 'wouter';

import {QueryState} from '../components/AppLayout';
import {useYears} from '../queries/projects';

export function YearsPage() {
  const years = useYears();
  return (
    <QueryState loading={years.isLoading} error={years.error}>
      <main className="archivePage">
        <header className="archiveHero">
          <p className="kicker">The improbable, indexed</p>
          <h1>Hackweek archives</h1>
          <p>
            Browse the prototypes, beautiful mistakes, and useful oddities that escaped
            the roadmap.
          </p>
        </header>
        {!years.data?.years.length ? (
          <section className="emptyState">
            <span>00</span>
            <h2>No years are in the archive yet</h2>
            <p>An administrator can open the first Hackweek year.</p>
          </section>
        ) : (
          <ol className="yearTimeline">
            {years.data.years.map((year, index) => (
              <li key={year.id}>
                <span className="timelineIndex">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Link href={`/years/${year.id}/projects`}>
                  <strong>{year.id}</strong>
                  <span>
                    {year.projectCount} projects · {year.ideaCount} ideas ·{' '}
                    {year.groupCount} groups
                  </span>
                  <em>{year.submissionsClosed ? 'Archived' : 'Submissions open'} →</em>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </QueryState>
  );
}
