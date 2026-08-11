import {useState, type FormEvent} from 'react';

import type {GroupSummary} from '../../shared/projects';
import {useGroupMutations} from '../queries/projects';

export function GroupManager({yearId, groups}: {yearId: string; groups: GroupSummary[]}) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<GroupSummary | null>(null);
  const mutations = useGroupMutations(yearId);
  const error =
    mutations.create.error ?? mutations.update.error ?? mutations.remove.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (editing) {
      mutations.update.mutate(
        {id: editing.id, name},
        {
          onSuccess: () => {
            setEditing(null);
            setName('');
          },
        },
      );
    } else {
      mutations.create.mutate({name}, {onSuccess: () => setName('')});
    }
  }

  return (
    <section className="groupManager" aria-labelledby="group-manager-title">
      <header>
        <div>
          <p className="kicker">Admin controls</p>
          <h2 id="group-manager-title">Groups</h2>
        </div>
        <p>Deleting a group leaves its projects intact and marks them ungrouped.</p>
      </header>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <span>
              <strong>{group.name}</strong>
              <small>{group.projectCount} projects</small>
            </span>
            <span>
              <button
                onClick={() => {
                  setEditing(group);
                  setName(group.name);
                }}
              >
                Rename
              </button>
              <button
                className="dangerAction"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${group.name}? Projects will become ungrouped.`,
                    )
                  ) {
                    mutations.remove.mutate(group.id);
                  }
                }}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit}>
        <label>
          <span>{editing ? 'New group name' : 'Add group'}</span>
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {editing && (
          <button
            type="button"
            className="textAction"
            onClick={() => {
              setEditing(null);
              setName('');
            }}
          >
            Cancel
          </button>
        )}
        <button
          className="primaryAction"
          type="submit"
          disabled={mutations.create.isPending || mutations.update.isPending}
        >
          {editing ? 'Save name' : 'Create group'}
        </button>
      </form>
      {error && (
        <p className="formError" role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}
