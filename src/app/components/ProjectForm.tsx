import {useEffect, useState, type FormEvent} from 'react';

import type {ProjectDetail, ProjectWriteRequest} from '../../shared/projects';
import {useProjectOptions} from '../queries/projects';

export function ProjectForm({
  yearId,
  project,
  claim = false,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  yearId: string;
  project?: ProjectDetail;
  claim?: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: ProjectWriteRequest) => void;
}) {
  const options = useProjectOptions(yearId);
  const [name, setName] = useState(project?.name ?? '');
  const [summary, setSummary] = useState(project?.summary ?? '');
  const [repository, setRepository] = useState(project?.repository ?? '');
  const [kind, setKind] = useState<ProjectWriteRequest['kind']>(
    claim ? 'project' : (project?.kind ?? 'project'),
  );
  const [groupId, setGroupId] = useState(project?.group?.id ?? '');
  const [memberIds, setMemberIds] = useState(project?.members.map(({id}) => id) ?? []);
  const [needsHelp, setNeedsHelp] = useState(project?.needsHelp ?? false);
  const [helpDetails, setHelpDetails] = useState(project?.helpDetails ?? '');

  useEffect(() => {
    if (!project || claim) return;
    setName(project.name);
    setSummary(project.summary);
    setRepository(project.repository ?? '');
    setKind(project.kind);
    setGroupId(project.group?.id ?? '');
    setMemberIds(project.members.map(({id}) => id));
    setNeedsHelp(project.needsHelp);
    setHelpDetails(project.helpDetails ?? '');
  }, [claim, project]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      yearId,
      name,
      summary,
      repository: repository || null,
      kind,
      groupId: kind === 'idea' ? null : groupId || null,
      memberIds: kind === 'idea' ? [] : memberIds,
      needsHelp: kind === 'project' && needsHelp,
      helpDetails: kind === 'project' && needsHelp ? helpDetails || null : null,
    });
  }

  if (options.isLoading) return <p className="formNotice">Loading collaborators…</p>;
  if (options.error) return <p className="formError">{options.error.message}</p>;

  return (
    <form className="projectForm" onSubmit={submit}>
      <div className="formIntro">
        <span>01</span>
        <p>name the project and explain what you want to make this week.</p>
      </div>
      <label className="fullField">
        <span>Name</span>
        <input
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="fullField">
        <span>Summary</span>
        <textarea
          required
          rows={7}
          maxLength={10000}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>
      {!project && !claim && (
        <fieldset className="kindPicker">
          <legend>What are you putting on the board?</legend>
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'project'}
              onChange={() => setKind('project')}
            />
            <span>
              <strong>Project</strong> Ready for a team and group.
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'idea'}
              onChange={() => setKind('idea')}
            />
            <span>
              <strong>Idea</strong> A spark someone else can claim.
            </span>
          </label>
        </fieldset>
      )}
      {kind === 'project' && (
        <>
          <div className="formIntro">
            <span>02</span>
            <p>choose a group and add your team.</p>
          </div>
          <label>
            <span>Group</span>
            <select
              required
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">Choose a group</option>
              {options.data?.groups.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Repository</span>
            <input
              type="url"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              placeholder="https://github.com/…"
            />
          </label>
          <fieldset className="teamPicker">
            <legend>Team</legend>
            {options.data?.users.map((user) => (
              <label key={user.id}>
                <input
                  type="checkbox"
                  checked={memberIds.includes(user.id)}
                  onChange={(event) =>
                    setMemberIds((members) =>
                      event.target.checked
                        ? [...members, user.id]
                        : members.filter((id) => id !== user.id),
                    )
                  }
                />
                <span>
                  {user.displayName}
                  <small>{user.email}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="checkField">
            <input
              type="checkbox"
              checked={needsHelp}
              onChange={(event) => setNeedsHelp(event.target.checked)}
            />
            <span>
              <strong>looking for help</strong> let everyone know this project needs more
              people.
            </span>
          </label>
          {needsHelp && (
            <label className="fullField">
              <span>What kind of help?</span>
              <textarea
                rows={3}
                value={helpDetails}
                onChange={(event) => setHelpDetails(event.target.value)}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p className="formError" role="alert">
          {error}
        </p>
      )}
      <div className="formActions">
        <button type="button" className="textAction" onClick={onCancel}>
          Never mind
        </button>
        <button type="submit" className="primaryAction" disabled={saving}>
          {saving
            ? 'Saving…'
            : claim
              ? 'Claim project'
              : project
                ? 'Save changes'
                : 'Create project'}
        </button>
      </div>
    </form>
  );
}
