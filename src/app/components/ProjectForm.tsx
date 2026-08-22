import {useEffect, useId, useState, type FormEvent, type KeyboardEvent} from 'react';

import type {ProjectDetail, ProjectWriteRequest} from '../../shared/projects';
import {getAwardCategoryDescription} from '../awardCategories';
import {useProjectOptions} from '../queries/projects';
import {UserAvatar} from './UserAvatar';

export function ProjectForm({
  yearId,
  project,
  claim = false,
  saving,
  error,
  nominationsReadOnly = false,
  onCancel,
  onSubmit,
}: {
  yearId: string;
  project?: ProjectDetail;
  claim?: boolean;
  saving: boolean;
  error: string | null;
  nominationsReadOnly?: boolean;
  onCancel: () => void;
  onSubmit: (value: ProjectWriteRequest) => void;
}) {
  const options = useProjectOptions(yearId);
  const initial = initialValues(project, claim);
  const [name, setName] = useState(initial.name);
  const [summary, setSummary] = useState(initial.summary);
  const [repository, setRepository] = useState(initial.repository);
  const [kind, setKind] = useState<ProjectWriteRequest['kind']>(initial.kind);
  const [groupId, setGroupId] = useState(initial.groupId);
  const [memberIds, setMemberIds] = useState(initial.memberIds);
  const [nominationMode, setNominationMode] = useState<'all' | 'focused'>(
    initial.nominationCategoryIds.length ? 'focused' : 'all',
  );
  const [nominationCategoryIds, setNominationCategoryIds] = useState(
    initial.nominationCategoryIds,
  );
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResultsOpen, setMemberResultsOpen] = useState(false);
  const [highlightedMember, setHighlightedMember] = useState(-1);
  const memberListboxId = useId();
  const memberSearchId = useId();
  const awardTargetingDetailId = useId();
  const [needsHelp, setNeedsHelp] = useState(initial.needsHelp);
  const [helpDetails, setHelpDetails] = useState(initial.helpDetails);

  useEffect(() => {
    if (!project || claim) return;
    setName(project.name);
    setSummary(project.summary);
    setRepository(project.repository ?? '');
    setKind(project.kind);
    setGroupId(project.group?.id ?? '');
    setMemberIds(project.members.map(({id}) => id));
    setNominationMode(project.nominationCategoryIds.length ? 'focused' : 'all');
    setNominationCategoryIds(project.nominationCategoryIds);
    setNeedsHelp(project.needsHelp);
    setHelpDetails(project.helpDetails ?? '');
  }, [claim, project]);

  const users = options.data?.users ?? [];
  const categories = options.data?.categories ?? [];
  const nominationsLocked = Boolean(project && !claim && nominationsReadOnly);
  const selectedMembers = memberIds.flatMap((id) => {
    const member =
      users.find((user) => user.id === id) ??
      project?.members.find((user) => user.id === id);
    return member ? [member] : [];
  });
  const normalizedMemberQuery = memberQuery.trim().toLowerCase();
  const matchingMembers = normalizedMemberQuery
    ? users
        .filter(
          (user) =>
            !memberIds.includes(user.id) &&
            (user.displayName.toLowerCase().includes(normalizedMemberQuery) ||
              user.email.toLowerCase().includes(normalizedMemberQuery)),
        )
        .slice(0, 8)
    : [];
  const showMemberResults = memberResultsOpen && Boolean(normalizedMemberQuery);
  const dirty =
    name !== initial.name ||
    summary !== initial.summary ||
    repository !== initial.repository ||
    kind !== initial.kind ||
    groupId !== initial.groupId ||
    needsHelp !== initial.needsHelp ||
    helpDetails !== initial.helpDetails ||
    memberIds.length !== initial.memberIds.length ||
    memberIds.some((id) => !initial.memberIds.includes(id)) ||
    nominationMode !== (initial.nominationCategoryIds.length ? 'focused' : 'all') ||
    nominationCategoryIds.length !== initial.nominationCategoryIds.length ||
    nominationCategoryIds.some(
      (id, index) => id !== initial.nominationCategoryIds[index],
    );

  function addMember(id: string) {
    setMemberIds((members) => (members.includes(id) ? members : [...members, id]));
    setMemberQuery('');
    setMemberResultsOpen(false);
    setHighlightedMember(-1);
  }

  function toggleNomination(id: string) {
    setNominationCategoryIds((selected) =>
      selected.includes(id)
        ? selected.filter((categoryId) => categoryId !== id)
        : selected.length < 2
          ? [...selected, id]
          : selected,
    );
  }

  function handleMemberSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && memberResultsOpen) {
      event.preventDefault();
      setMemberResultsOpen(false);
      setHighlightedMember(-1);
      return;
    }
    if (event.key === 'Enter' && showMemberResults) {
      event.preventDefault();
      const member = matchingMembers[highlightedMember < 0 ? 0 : highlightedMember];
      if (member) addMember(member.id);
      return;
    }
    if (!matchingMembers.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMemberResultsOpen(true);
      setHighlightedMember((index) => (index + 1) % matchingMembers.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMemberResultsOpen(true);
      setHighlightedMember((index) =>
        index <= 0 ? matchingMembers.length - 1 : index - 1,
      );
    }
  }

  function cancel() {
    if (dirty && !window.confirm('Discard your unsaved changes to this project?')) return;
    onCancel();
  }

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
      nominationCategoryIds:
        kind === 'idea' || nominationMode === 'all' ? [] : nominationCategoryIds,
      needsHelp: kind === 'project' && needsHelp,
      helpDetails: kind === 'project' && needsHelp ? helpDetails || null : null,
    });
  }

  if (options.isLoading)
    return (
      <p className="formNotice" role="status">
        Loading project options…
      </p>
    );
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
        <small className="fieldHint">
          Markdown supported — add links, headings, lists, tables, and more.
        </small>
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
            {selectedMembers.length ? (
              <ul className="selectedTeam" aria-label="Selected team members">
                {selectedMembers.map((member) => (
                  <li className="teamMemberChip" key={member.id}>
                    <UserAvatar user={member} />
                    <span>
                      <strong>{member.displayName}</strong>
                      <small>{member.email}</small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${member.displayName} from team`}
                      onClick={() =>
                        setMemberIds((members) =>
                          members.filter((id) => id !== member.id),
                        )
                      }
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="teamSelectionEmpty">No team members selected yet.</p>
            )}
            <div
              className="teamSearch"
              onBlur={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                ) {
                  setMemberResultsOpen(false);
                  setHighlightedMember(-1);
                }
              }}
            >
              <label htmlFor={memberSearchId}>Search members</label>
              <input
                id={memberSearchId}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-controls={memberListboxId}
                aria-expanded={showMemberResults}
                aria-activedescendant={
                  showMemberResults && highlightedMember >= 0
                    ? `${memberListboxId}-option-${highlightedMember}`
                    : undefined
                }
                autoComplete="off"
                placeholder="Search by name or email"
                value={memberQuery}
                onFocus={() => {
                  if (normalizedMemberQuery) setMemberResultsOpen(true);
                }}
                onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setMemberResultsOpen(Boolean(event.target.value.trim()));
                  setHighlightedMember(-1);
                }}
                onKeyDown={handleMemberSearchKeyDown}
              />
              {showMemberResults &&
                (matchingMembers.length ? (
                  <ul className="teamSearchResults" id={memberListboxId} role="listbox">
                    {matchingMembers.map((member, index) => (
                      <li key={member.id}>
                        <button
                          id={`${memberListboxId}-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={highlightedMember === index}
                          onMouseEnter={() => setHighlightedMember(index)}
                          onClick={() => addMember(member.id)}
                        >
                          <UserAvatar user={member} />
                          <span>
                            <strong>{member.displayName}</strong>
                            <small>{member.email}</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="teamSearchEmpty" role="status">
                    No matches
                  </p>
                ))}
            </div>
          </fieldset>
          <div className="formIntro">
            <span>03</span>
            <p>choose how this project will show up on the awards ballot.</p>
          </div>
          <fieldset
            className={`awardTargeting${nominationsLocked ? ' awardTargeting--locked' : ''}`}
            disabled={nominationsLocked}
            aria-describedby={awardTargetingDetailId}
          >
            <legend>Award targeting</legend>
            <p className="awardTargetingIntro" id={awardTargetingDetailId}>
              Keep every category open, or focus the project on one or two awards.
            </p>
            {nominationsLocked && (
              <p className="awardTargetingLock" role="note">
                <strong>Voting is open.</strong> Award targeting is locked so current
                ballots stay valid. You can still edit the other project details.
              </p>
            )}
            <div className="awardModes">
              <label
                className={`awardModeCard${nominationMode === 'all' ? ' awardModeCard--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="nominationMode"
                  value="all"
                  checked={nominationMode === 'all'}
                  onChange={() => {
                    setNominationMode('all');
                    setNominationCategoryIds([]);
                  }}
                />
                <span className="awardModeIcon" aria-hidden="true">
                  ∞
                </span>
                <span>
                  <strong>All award categories</strong>
                  <small>Voters can consider this project for every award.</small>
                </span>
              </label>
              <label
                className={`awardModeCard${nominationMode === 'focused' ? ' awardModeCard--selected' : ''}${!categories.length ? ' awardModeCard--unavailable' : ''}`}
              >
                <input
                  type="radio"
                  name="nominationMode"
                  value="focused"
                  checked={nominationMode === 'focused'}
                  disabled={!categories.length || nominationsLocked}
                  onChange={() => setNominationMode('focused')}
                />
                <span className="awardModeIcon" aria-hidden="true">
                  1–2
                </span>
                <span>
                  <strong>Focus on specific awards</strong>
                  <small>
                    {categories.length
                      ? 'Choose one or two categories this project is aiming for.'
                      : 'No award categories are available yet.'}
                  </small>
                </span>
              </label>
            </div>
            {nominationMode === 'focused' && (
              <div className="awardCategoryPicker">
                <div className="awardCategoryPickerHeader">
                  <p>Pick at least one category. A maximum of two can be selected.</p>
                  <output aria-live="polite">
                    {nominationCategoryIds.length} of 2 selected
                  </output>
                </div>
                {categories.length ? (
                  <div className="awardCategoryChoices">
                    {categories.map((category, index) => {
                      const selected = nominationCategoryIds.includes(category.id);
                      const atLimit = nominationCategoryIds.length >= 2;
                      return (
                        <label
                          className={`awardCategoryChoice${selected ? ' awardCategoryChoice--selected' : ''}${atLimit && !selected ? ' awardCategoryChoice--limited' : ''}`}
                          key={category.id}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            required={index === 0 && nominationCategoryIds.length === 0}
                            disabled={nominationsLocked || (atLimit && !selected)}
                            onChange={() => toggleNomination(category.id)}
                          />
                          <span className="awardCategoryChoiceCopy">
                            <strong>{category.name}</strong>
                            <small>{getAwardCategoryDescription(category.name)}</small>
                          </span>
                          {atLimit && !selected && <small>two selected</small>}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="awardCategoryEmpty" role="status">
                    Award categories have not been announced. Keep “all award categories”
                    selected for now.
                  </p>
                )}
              </div>
            )}
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
        <button type="button" className="textAction" onClick={cancel}>
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

function initialValues(project: ProjectDetail | undefined, claim: boolean) {
  const kind: ProjectWriteRequest['kind'] = claim
    ? 'project'
    : (project?.kind ?? 'project');
  return {
    name: project?.name ?? '',
    summary: project?.summary ?? '',
    repository: project?.repository ?? '',
    kind,
    groupId: project?.group?.id ?? '',
    memberIds: project?.members.map(({id}) => id) ?? [],
    nominationCategoryIds: claim ? [] : (project?.nominationCategoryIds ?? []),
    needsHelp: project?.needsHelp ?? false,
    helpDetails: project?.helpDetails ?? '',
  };
}
