import {Link, useParams} from 'wouter';

import {PageState, QueryState} from '../components/AppLayout';
import {ProjectCard} from '../components/ProjectCard';
import {UserAvatar} from '../components/UserAvatar';
import {useUserProfile} from '../queries/projects';

export function UserPage() {
  const {userId} = useParams<{userId: string}>();
  const profile = useUserProfile(userId);

  return (
    <QueryState loading={profile.isLoading} error={profile.error}>
      {profile.data && (
        <main className="userPage">
          <header className="userHero">
            <Link className="backLink" href="/years">
              ← hackweek archive
            </Link>
            <div className="userIdentity">
              <UserAvatar user={profile.data.user} />
              <div>
                <p className="kicker">Hackweek maker</p>
                <h1>{profile.data.user.displayName}</h1>
                <a href={`mailto:${profile.data.user.email}`}>
                  {profile.data.user.email}
                </a>
              </div>
            </div>
            <dl className="userHighlights" aria-label="Hackweek highlights">
              <Highlight
                value={profile.data.highlights.hackweekCount}
                label="Hackweeks"
              />
              <Highlight value={profile.data.highlights.projectCount} label="Projects" />
              <Highlight value={profile.data.highlights.ideaCount} label="Ideas opened" />
              <Highlight value={profile.data.highlights.awardCount} label="Awards" />
            </dl>
          </header>

          {profile.data.awards.length > 0 && (
            <section className="userAwards" aria-labelledby="user-awards-title">
              <header>
                <p className="kicker">Highlights</p>
                <h2 id="user-awards-title">award shelf</h2>
              </header>
              <div>
                {profile.data.awards.map((award) => (
                  <Link
                    key={award.id}
                    href={`/years/${award.yearId}/projects/${award.projectId}`}
                  >
                    <span>{award.yearId}</span>
                    <strong>{award.name || award.categoryName}</strong>
                    <small>{award.projectName}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!profile.data.years.length ? (
            <PageState
              title="No Hackweek history yet"
              detail={`${profile.data.user.displayName} has not joined or opened a project yet.`}
            />
          ) : (
            <div className="userTimeline">
              {profile.data.years.map((year) => (
                <section
                  className="userYear"
                  aria-labelledby={`user-year-${year.yearId}`}
                  key={year.yearId}
                >
                  <header>
                    <div>
                      <p className="kicker">Hackweek</p>
                      <h2 id={`user-year-${year.yearId}`}>{year.yearId}</h2>
                    </div>
                    <Link href={`/years/${year.yearId}/projects`}>view year →</Link>
                  </header>
                  <div className="projectGrid">
                    {year.projects.map((project) => (
                      <ProjectCard project={project} key={project.id} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      )}
    </QueryState>
  );
}

function Highlight({value, label}: {value: number; label: string}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
