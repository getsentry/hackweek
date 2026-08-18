import {Link} from 'wouter';

import {QueryState} from '../components/AppLayout';
import {useYears} from '../queries/projects';

const yearBanners = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../assets/images/banner/year-*.png', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, banner]) => [path.match(/year-(\d+)\.png$/)![1], banner]),
);

export function YearsPage() {
  const years = useYears();
  const [currentYear, ...archiveYears] = years.data?.years ?? [];

  return (
    <QueryState loading={years.isLoading} error={years.error}>
      <main className="archivePage">
        {!currentYear ? (
          <section className="emptyState">
            <span>00</span>
            <h2>No years are in the archive yet</h2>
            <p>An administrator can open the first Hackweek year.</p>
          </section>
        ) : (
          <>
            <section
              className="currentYearHero"
              aria-labelledby={`current-year-${currentYear.id}`}
            >
              <Link
                className="currentYearHeroMedia"
                href={`/years/${currentYear.id}/projects`}
                aria-label={`View Hackweek ${currentYear.id} projects`}
              >
                <YearBanner yearId={currentYear.id} />
              </Link>
              <div className="currentYearHeroContent">
                <div className="currentYearHeroCopy">
                  <p className="kicker">Current Hackweek</p>
                  <h1 id={`current-year-${currentYear.id}`}>Hackweek {currentYear.id}</h1>
                  <p>
                    {currentYear.submissionsClosed
                      ? 'Revisit the projects and ideas built during this Hackweek.'
                      : 'Explore projects, share ideas, and find a team to build with.'}
                  </p>
                </div>
                <div className="currentYearHeroDetails">
                  <dl className="currentYearStats">
                    <div>
                      <dt>participants</dt>
                      <dd>{currentYear.participantCount}</dd>
                    </div>
                    <div>
                      <dt>projects</dt>
                      <dd>{currentYear.projectCount}</dd>
                    </div>
                    <div>
                      <dt>ideas</dt>
                      <dd>{currentYear.ideaCount}</dd>
                    </div>
                  </dl>
                  <Link
                    className="currentYearAction"
                    href={`/years/${currentYear.id}/projects`}
                  >
                    {yearActionLabel(currentYear)} →
                  </Link>
                </div>
              </div>
            </section>

            <section className="archiveSection" aria-labelledby="archives-heading">
              <header className="archiveHero pageHeader archiveSectionHeader">
                <div>
                  <p className="kicker">Past Hackweeks</p>
                  <h2 id="archives-heading">Archives</h2>
                </div>
                <p>
                  browse projects, ideas, teams, and award winners from earlier Hackweeks.
                </p>
              </header>
              {archiveYears.length ? (
                <ol className="yearTimeline" aria-label="Archived Hackweek years">
                  {archiveYears.map((year) => (
                    <li key={year.id} className="yearArchiveCard">
                      <Link href={`/years/${year.id}/projects`}>
                        <YearBanner yearId={year.id} />
                        <div className="yearArchiveMeta">
                          <div>
                            <strong>{year.id}</strong>
                            <span>
                              {year.participantCount} participants · {year.projectCount}{' '}
                              projects
                              {year.ideaCount > 0 ? ` · ${year.ideaCount} ideas` : ''}
                            </span>
                          </div>
                          <em>{yearActionLabel(year)} →</em>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="archiveEmpty">Past Hackweeks will appear here.</p>
              )}
            </section>
          </>
        )}
      </main>
    </QueryState>
  );
}

function yearActionLabel(year: {votingEnabled: boolean; submissionsClosed: boolean}) {
  if (year.votingEnabled) return 'voting open';
  return year.submissionsClosed ? 'view archive' : 'submissions open';
}

function YearBanner({yearId}: {yearId: string}) {
  const banner = yearBanners[yearId];
  return banner ? (
    <img className="yearBanner" src={banner} alt={`${yearId} Hackweek banner`} />
  ) : (
    <div className="yearBannerFallback" aria-hidden="true">
      <span>#HACKWEEK</span>
      <strong>{yearId}</strong>
    </div>
  );
}
