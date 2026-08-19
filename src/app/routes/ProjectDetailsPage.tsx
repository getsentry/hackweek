import {useState, type ChangeEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link, useLocation, useParams} from 'wouter';

import {QueryState} from '../components/AppLayout';
import {Markdown} from '../components/Markdown';
import {ProjectVoting} from '../components/ProjectVoting';
import {useBallotStatus} from '../queries/administration';
import {getPlayback, useProjectVideo} from '../queries/videos';
import {ProjectVideoPanel} from '../video/ProjectVideoPanel';
import {
  useDeleteMedia,
  useDeleteProject,
  useProject,
  useUploadMedia,
} from '../queries/projects';

export function ProjectDetailsPage() {
  const {yearId, projectId} = useParams<{
    yearId: string;
    projectId: string;
  }>();
  const [, navigate] = useLocation();
  const project = useProject(projectId);
  const ballotYearId = project.data?.project.yearId ?? yearId;
  const ballot = useBallotStatus(ballotYearId, project.data?.project.kind === 'project');
  const withdraw = useDeleteProject();
  const upload = useUploadMedia(projectId);
  const removeMedia = useDeleteMedia(projectId);
  const video = useProjectVideo(projectId);
  const playback = useQuery({
    queryKey: ['video-playback', video.data?.video?.id],
    queryFn: () => getPlayback(video.data!.video!.id),
    enabled: video.data?.video?.status === 'ready',
  });
  const [actionError, setActionError] = useState<string | null>(null);

  function addMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setActionError(null);
    upload.mutate(file, {onError: (error) => setActionError(error.message)});
    event.target.value = '';
  }

  return (
    <QueryState loading={project.isLoading} error={project.error}>
      {project.data && (
        <main className="detailPage">
          <header className="detailHero">
            <div>
              <Link className="backLink" href={`/years/${yearId}/projects`}>
                ← {yearId} projects
              </Link>
              <div className="detailTags">
                <span>
                  {project.data.project.kind === 'idea'
                    ? 'Open idea'
                    : (project.data.project.group?.name ?? 'Ungrouped')}
                </span>
                {project.data.project.needsHelp && <span>Looking for help</span>}
              </div>
              <h1>{project.data.project.name}</h1>
              <p>created by {project.data.project.creator.displayName}</p>
            </div>
            <div className="detailActions">
              {project.data.project.permissions.canClaim && (
                <Link
                  className="primaryAction"
                  href={`/years/${yearId}/projects/${projectId}/edit?claim`}
                >
                  Claim this idea
                </Link>
              )}
              {project.data.project.permissions.canEdit && (
                <Link
                  className="textAction"
                  href={`/years/${yearId}/projects/${projectId}/edit`}
                >
                  Edit project
                </Link>
              )}
              {project.data.project.permissions.canDelete && (
                <button
                  className="dangerAction"
                  disabled={withdraw.isPending}
                  onClick={() => {
                    if (!window.confirm('Withdraw this project from the archive?'))
                      return;
                    withdraw.mutate(projectId, {
                      onSuccess: () => navigate(`/years/${yearId}/projects`),
                      onError: (error) => setActionError(error.message),
                    });
                  }}
                >
                  withdraw
                </button>
              )}
            </div>
          </header>
          {actionError && (
            <p className="formError" role="alert">
              {actionError}
            </p>
          )}
          <div className="detailLayout">
            <article className="projectNarrative">
              <p className="kicker">project summary</p>
              <h2>about this project</h2>
              <Markdown>{project.data.project.summary}</Markdown>
              {project.data.project.repository && (
                <a
                  className="repoLink"
                  href={project.data.project.repository}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open repository ↗
                </a>
              )}
              {project.data.project.needsHelp && (
                <aside className="helpCallout">
                  <strong>this project is looking for help</strong>
                  <p>
                    {project.data.project.helpDetails ||
                      'Reach out to the team to find out how you can help.'}
                  </p>
                </aside>
              )}
            </article>
            <aside className="teamPanel">
              <p className="kicker">team</p>
              <h2>
                {project.data.project.members.length
                  ? `${project.data.project.members.length} participants`
                  : 'up for grabs'}
              </h2>
              <ul>
                {project.data.project.members.map((member) => (
                  <li key={member.id}>
                    <span>{initials(member.displayName)}</span>
                    <a href={`mailto:${member.email}`}>
                      <strong>{member.displayName}</strong>
                      <small>{member.email}</small>
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
          {project.data.project.kind === 'project' && ballot.isLoading && (
            <section
              className="projectVoting projectVoting--notice"
              aria-labelledby="project-voting-loading-title"
              aria-busy="true"
            >
              <p className="kicker">award ballot</p>
              <h2 id="project-voting-loading-title">loading voting status…</h2>
            </section>
          )}
          {project.data.project.kind === 'project' && ballot.error && (
            <section
              className="projectVoting projectVoting--notice"
              aria-labelledby="project-voting-error-title"
            >
              <p className="kicker">award ballot</p>
              <h2 id="project-voting-error-title">voting status unavailable</h2>
              <p role="alert">{ballot.error.message}</p>
              <button
                type="button"
                className="textAction"
                onClick={() => void ballot.refetch()}
              >
                try again
              </button>
            </section>
          )}
          {project.data.project.kind === 'project' &&
            !ballot.error &&
            ballot.data?.year.votingEnabled && (
              <ProjectVoting
                ballot={ballot.data}
                project={{
                  id: project.data.project.id,
                  name: project.data.project.name,
                  yearId: project.data.project.yearId,
                  canVote: project.data.project.permissions.canVote,
                  nominationCategoryIds: project.data.project.nominationCategoryIds,
                }}
              />
            )}
          {project.data.project.kind === 'project' && (
            <ProjectVideoPanel
              projectId={projectId}
              video={video.data?.video ?? null}
              loading={video.isLoading}
              canManage={project.data.project.permissions.canManageMedia}
              playback={playback.data}
              playbackError={playback.error?.message}
            />
          )}
          {project.data.project.kind === 'project' && (
            <section className="mediaSection">
              <header>
                <div>
                  <p className="kicker">project media</p>
                  <h2>attachments</h2>
                </div>
                {project.data.project.permissions.canManageMedia && (
                  <label className="uploadAction">
                    {upload.isPending ? 'Uploading…' : 'Add media'}
                    <input type="file" disabled={upload.isPending} onChange={addMedia} />
                  </label>
                )}
              </header>
              {!project.data.project.media.length ? (
                <p className="mediaEmpty">
                  No attachments yet. Projects without media or video are still complete
                  records.
                </p>
              ) : (
                <ul className="mediaList">
                  {project.data.project.media.map((media) => {
                    const isImage = isImageMediaType(media.mediaType);
                    const contentUrl = `/api/media/${encodeURIComponent(media.id)}/content`;
                    const href = isImage ? `${contentUrl}?preview=1` : contentUrl;
                    return (
                      <li
                        key={media.id}
                        className={isImage ? 'imageAttachment' : undefined}
                      >
                        <a
                          className="mediaLink"
                          href={href}
                          {...(isImage
                            ? {
                                target: '_blank',
                                rel: 'noreferrer',
                                'aria-label': `Open ${media.originalName} full size`,
                              }
                            : {})}
                        >
                          {isImage && (
                            <span className="mediaPreview">
                              <img src={href} alt="" loading="lazy" />
                              <span>open full size ↗</span>
                            </span>
                          )}
                          <span className="mediaMeta">
                            <strong>{media.originalName}</strong>
                            <small>{formatBytes(media.sizeBytes)}</small>
                          </span>
                        </a>
                        {project.data.project.permissions.canManageMedia && (
                          <button
                            onClick={() => removeMedia.mutate(media.id)}
                            disabled={removeMedia.isPending}
                          >
                            Delete
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </main>
      )}
    </QueryState>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function isImageMediaType(mediaType: string | null) {
  return mediaType?.toLowerCase().startsWith('image/') ?? false;
}

function formatBytes(value: number | null) {
  if (value === null) return 'Size unknown';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value > 1024 * 100 ? 0 : 1)} KiB`;
}
