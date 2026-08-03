import {useState, type ChangeEvent} from 'react';
import {Link, useLocation, useParams} from 'wouter';

import {QueryState} from '../components/AppLayout';
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
  const withdraw = useDeleteProject();
  const upload = useUploadMedia(projectId);
  const removeMedia = useDeleteMedia(projectId);
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
              <p>Proposed by {project.data.project.creator.displayName}</p>
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
                  Withdraw
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
              <p className="kicker">The proposition</p>
              <h2>What are we making?</h2>
              <p>{project.data.project.summary}</p>
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
                  <strong>Co-conspirators wanted</strong>
                  <p>
                    {project.data.project.helpDetails ||
                      'Reach out to the team to find out how you can help.'}
                  </p>
                </aside>
              )}
            </article>
            <aside className="teamPanel">
              <p className="kicker">The crew</p>
              <h2>
                {project.data.project.members.length
                  ? `${project.data.project.members.length} collaborators`
                  : 'Up for grabs'}
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
          {project.data.project.kind === 'project' && (
            <section className="mediaSection">
              <header>
                <div>
                  <p className="kicker">Private archive</p>
                  <h2>Project artifacts</h2>
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
                  {project.data.project.media.map((media) => (
                    <li key={media.id}>
                      <a href={`/api/media/${media.id}/content`}>
                        <strong>{media.originalName}</strong>
                        <span>{formatBytes(media.sizeBytes)}</span>
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
                  ))}
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

function formatBytes(value: number | null) {
  if (value === null) return 'Size unknown';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value > 1024 * 100 ? 0 : 1)} KiB`;
}
