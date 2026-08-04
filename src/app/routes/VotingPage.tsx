import {useState} from 'react';
import {Link, useParams} from 'wouter';

import {QueryState} from '../components/AppLayout';
import {useVoteMutation, useVoting} from '../queries/administration';

export function VotingPage() {
  const {yearId} = useParams<{yearId: string}>();
  const query = useVoting(yearId);
  const vote = useVoteMutation(yearId);
  const [search, setSearch] = useState('');

  return (
    <main className="operationsPage">
      <Link className="backLink" href={`/years/${yearId}/projects`}>
        ← Projects
      </Link>
      <header className="operationsHero">
        <div>
          <p className="kicker">Ballot / {yearId}</p>
          <h1>Cast the signal.</h1>
        </div>
        <p>
          One vote per category. A later choice moves your vote; your own projects are
          unavailable.
        </p>
      </header>
      <QueryState loading={query.isLoading} error={query.error}>
        {query.data && (
          <>
            <div className="operationsBar">
              <strong>
                {query.data.year.votingEnabled ? 'Voting is open' : 'Voting is closed'}
              </strong>
              <label>
                Find a project{' '}
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            {!query.data.categories.length ? (
              <p className="emptyPanel">No award categories are configured.</p>
            ) : (
              <div className="ballotSections">
                {query.data.categories.map((category) => {
                  const current = query.data.votes.find(
                    (item) => item.categoryId === category.id,
                  );
                  const projects = query.data.projects.filter((project) => {
                    const phrase =
                      `${project.name} ${project.memberNames.join(' ')}`.toLowerCase();
                    return (
                      phrase.includes(search.toLowerCase()) &&
                      (project.nominations.length === 0 ||
                        project.nominations.some(
                          (nomination) => nomination.categoryId === category.id,
                        ))
                    );
                  });
                  return (
                    <section key={category.id} className="ballotSection">
                      <header>
                        <p className="kicker">Award category</p>
                        <h2>{category.name}</h2>
                      </header>
                      <div className="ballotGrid">
                        {projects.map((project) => {
                          const selected = current?.projectId === project.id;
                          return (
                            <article
                              key={project.id}
                              className={
                                selected
                                  ? 'ballotCard ballotCard--selected'
                                  : 'ballotCard'
                              }
                            >
                              <div>
                                <small>{project.groupName ?? 'Independent'}</small>
                                <h3>{project.name}</h3>
                                <p>{project.summary}</p>
                              </div>
                              <footer>
                                <span>{project.memberNames.join(' · ')}</span>
                                <button
                                  className="primaryAction"
                                  disabled={
                                    !query.data.year.votingEnabled ||
                                    !project.eligible ||
                                    selected ||
                                    vote.isPending
                                  }
                                  onClick={() =>
                                    vote.mutate({
                                      voteId: current?.id,
                                      input: {
                                        yearId,
                                        projectId: project.id,
                                        categoryId: category.id,
                                      },
                                    })
                                  }
                                >
                                  {!project.eligible
                                    ? 'Own project'
                                    : selected
                                      ? 'Selected'
                                      : current
                                        ? 'Move vote'
                                        : 'Vote'}
                                </button>
                              </footer>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            {vote.error && (
              <p className="formError" role="alert">
                {vote.error.message}
              </p>
            )}
          </>
        )}
      </QueryState>
    </main>
  );
}
