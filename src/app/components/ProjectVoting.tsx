import {useState} from 'react';

import type {
  AwardCategorySummary,
  BallotSelection,
  BallotStatusResponse,
} from '../../shared/administration';
import {useVoteMutation} from '../queries/administration';

export function ProjectVoting({
  ballot,
  project,
}: {
  ballot: BallotStatusResponse;
  project: {id: string; name: string; yearId: string; canVote: boolean};
}) {
  const vote = useVoteMutation(project.yearId);
  const [confirmingCategoryId, setConfirmingCategoryId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const pendingCategory = ballot.categories.find(
    (category) => category.id === vote.variables?.input.categoryId,
  );

  function submit(category: AwardCategorySummary, selection?: BallotSelection) {
    setStatusMessage(null);
    vote.reset();
    vote.mutate(
      {
        voteId: selection?.id,
        input: {
          yearId: project.yearId,
          projectId: project.id,
          categoryId: category.id,
        },
      },
      {
        onSuccess: () => {
          setConfirmingCategoryId(null);
          setStatusMessage(`your ${category.name} vote is now on ${project.name}.`);
        },
      },
    );
  }

  return (
    <section className="projectVoting" aria-labelledby="project-voting-title">
      <header>
        <div>
          <p className="kicker">award ballot</p>
          <h2 id="project-voting-title">vote for this project</h2>
        </div>
        <p>
          choose the award categories where {project.name} stands out. each category gets
          one project.
        </p>
      </header>

      {!project.canVote && (
        <div className="projectVotingOwn" role="status">
          <strong>your project sits this one out</strong>
          <p>
            creators and teammates can’t vote for their own work, but your ballot is still
            open on every other project.
          </p>
        </div>
      )}

      {!ballot.categories.length ? (
        <p className="projectVotingEmpty">
          award categories are still being set up. check back soon.
        </p>
      ) : (
        <ul className="projectVotingCategories">
          {ballot.categories.map((category, index) => {
            const selection = ballot.votes.find(
              (item) => item.categoryId === category.id,
            );
            const selectedHere = selection?.projectId === project.id;
            const selectedElsewhere = Boolean(selection && !selectedHere);
            const confirming = selectedElsewhere && confirmingCategoryId === category.id;
            const pending =
              vote.isPending && vote.variables?.input.categoryId === category.id;
            const state = !project.canVote
              ? 'unavailable'
              : selectedHere
                ? 'selected'
                : selectedElsewhere
                  ? 'elsewhere'
                  : 'open';

            return (
              <li
                key={category.id}
                className={`projectVotingCategory projectVotingCategory--${state}`}
              >
                <span className="projectVotingNumber" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="projectVotingCategoryCopy">
                  <h3>{category.name}</h3>
                  {!project.canVote ? (
                    <p>unavailable on your own project</p>
                  ) : selectedHere ? (
                    <p>
                      <strong className="projectVotingSelected">your vote</strong>
                    </p>
                  ) : selection ? (
                    <p>
                      currently on <strong>{selection.projectName}</strong>
                      {!selection.projectActive && ' (project withdrawn)'}
                    </p>
                  ) : (
                    <p>no project selected yet</p>
                  )}
                </div>

                {project.canVote && !selectedHere && !confirming && (
                  <button
                    type="button"
                    className={selection ? 'textAction' : 'primaryAction'}
                    disabled={vote.isPending}
                    onClick={() => {
                      vote.reset();
                      setStatusMessage(null);
                      if (selection) {
                        setConfirmingCategoryId(category.id);
                      } else {
                        submit(category);
                      }
                    }}
                  >
                    {pending
                      ? 'casting your vote…'
                      : selection
                        ? 'move vote here'
                        : `vote for ${category.name}`}
                  </button>
                )}

                {confirming && selection && (
                  <div
                    className="projectVotingConfirm"
                    role="group"
                    aria-labelledby={`vote-confirm-${category.id}`}
                  >
                    <p id={`vote-confirm-${category.id}`} role="status">
                      move your {category.name} vote from{' '}
                      <strong>{selection.projectName}</strong> to{' '}
                      <strong>{project.name}</strong>?
                    </p>
                    <div>
                      <button
                        type="button"
                        className="textAction projectVotingCancel"
                        disabled={vote.isPending}
                        onClick={() => {
                          setConfirmingCategoryId(null);
                          vote.reset();
                        }}
                      >
                        cancel
                      </button>
                      <button
                        type="button"
                        className="primaryAction projectVotingMoveAction"
                        disabled={vote.isPending}
                        onClick={() => submit(category, selection)}
                      >
                        {pending ? 'moving your vote…' : 'confirm move'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {vote.isPending && (
        <p className="projectVotingFeedback projectVotingFeedback--pending" role="status">
          {vote.variables?.voteId ? 'moving' : 'casting'} your{' '}
          {pendingCategory?.name ?? 'award'} vote…
        </p>
      )}
      {statusMessage && (
        <p className="projectVotingFeedback projectVotingFeedback--success" role="status">
          {statusMessage}
        </p>
      )}
      {vote.error && (
        <p className="projectVotingFeedback projectVotingFeedback--error" role="alert">
          {vote.error.message}
        </p>
      )}
    </section>
  );
}
