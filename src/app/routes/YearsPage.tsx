import {Link} from 'wouter';

import {QueryState} from '../components/AppLayout';
import {useYears} from '../queries/projects';
import year2022 from '../../assets/images/banner/year-2022.png';
import year2023 from '../../assets/images/banner/year-2023.png';
import year2024 from '../../assets/images/banner/year-2024.png';

const yearBanners: Record<string, string> = {
  '2022': year2022,
  '2023': year2023,
  '2024': year2024,
};

export function YearsPage() {
  const years = useYears();
  return (
    <QueryState loading={years.isLoading} error={years.error}>
      <main className="archivePage">
        <header className="archiveHero pageHeader">
          <div>
            <p className="kicker">Sentry Hackweek</p>
            <h1>Hackweek archives</h1>
          </div>
          <p>browse projects, ideas, teams, and award winners from every Hackweek.</p>
        </header>
        {!years.data?.years.length ? (
          <section className="emptyState">
            <span>00</span>
            <h2>No years are in the archive yet</h2>
            <p>An administrator can open the first Hackweek year.</p>
          </section>
        ) : (
          <ol className="yearTimeline" aria-label="Hackweek years">
            {years.data.years.map((year) => (
              <li key={year.id} className="yearArchiveCard">
                <Link href={`/years/${year.id}/projects`}>
                  {yearBanners[year.id] ? (
                    <img
                      className="yearBanner"
                      src={yearBanners[year.id]}
                      alt={`${year.id} Hackweek banner`}
                    />
                  ) : (
                    <div className="yearBannerFallback" aria-hidden="true">
                      <span>#HACKWEEK</span>
                      <strong>{year.id}</strong>
                    </div>
                  )}
                  <div className="yearArchiveMeta">
                    <div>
                      <strong>{year.id}</strong>
                      <span>
                        {year.participantCount} participants · {year.projectCount}{' '}
                        projects
                        {year.ideaCount > 0 ? ` · ${year.ideaCount} ideas` : ''}
                      </span>
                    </div>
                    <em>
                      {year.submissionsClosed ? 'view archive' : 'submissions open'} →
                    </em>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </QueryState>
  );
}
