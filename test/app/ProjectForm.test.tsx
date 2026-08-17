import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ProjectForm} from '../../src/app/components/ProjectForm';
import type {
  ProjectDetail,
  ProjectMember,
  ProjectWriteRequest,
} from '../../src/shared/projects';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

describe('ProjectForm team picker', () => {
  it('filters members by partial name and email', async () => {
    renderProjectForm();
    const search = await screen.findByRole('combobox', {name: 'Search members'});

    await userEvent.type(search, 'lic');
    expect(screen.getByRole('option', {name: /Alice Example/})).toBeTruthy();
    expect(screen.queryByRole('option', {name: /Bob Builder/})).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, 'builder@sentry');
    expect(screen.getByRole('option', {name: /Bob Builder/})).toBeTruthy();
  });

  it('limits results and wraps keyboard navigation within displayed members', async () => {
    const users: ProjectMember[] = Array.from({length: 12}, (_, index) => ({
      id: `match-${index}`,
      email: `match-${index}@example.com`,
      displayName: `Match ${index}`,
      avatarUrl: null,
      role: 'member',
      actualRole: 'member',
    }));
    renderProjectForm({users});
    const search = await screen.findByRole('combobox', {name: 'Search members'});

    await userEvent.type(search, 'match');
    const results = screen.getByRole('listbox');
    expect(within(results).getAllByRole('option')).toHaveLength(8);
    expect(within(results).queryByRole('option', {name: /Match 8/})).toBeNull();

    await userEvent.keyboard('{ArrowUp}{Enter}');
    const selected = screen.getByRole('list', {name: 'Selected team members'});
    expect(within(selected).getByText('Match 7')).toBeTruthy();
  });

  it('adds a selected member and clears the search', async () => {
    renderProjectForm();
    const search = await screen.findByRole('combobox', {name: 'Search members'});

    await userEvent.type(search, 'alice');
    await userEvent.click(screen.getByRole('option', {name: /Alice Example/}));

    expect(search).toBeInstanceOf(HTMLInputElement);
    if (!(search instanceof HTMLInputElement)) throw new Error();
    expect(search.value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(
      within(screen.getByRole('list', {name: 'Selected team members'})).getByText(
        'Alice Example',
      ),
    ).toBeTruthy();
  });

  it('removes a selected member from the submitted member ids', async () => {
    const onSubmit = vi.fn<(value: ProjectWriteRequest) => void>();
    renderProjectForm({project: projectFixture, onSubmit});

    await userEvent.click(
      await screen.findByRole('button', {name: 'Remove Alice Example from team'}),
    );
    await userEvent.click(screen.getByRole('button', {name: 'Save changes'}));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({memberIds: []}));
  });

  it('does not render the full member list for an empty search', async () => {
    renderProjectForm();

    await screen.findByRole('combobox', {name: 'Search members'});
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('Alice Example')).toBeNull();
    expect(screen.queryByText('Bob Builder')).toBeNull();
  });

  it('shows edit-mode members as selected chips', async () => {
    renderProjectForm({project: projectFixture});

    const selected = await screen.findByRole('list', {name: 'Selected team members'});
    expect(within(selected).getByText('Alice Example')).toBeTruthy();
    expect(within(selected).getByText('alice@example.com')).toBeTruthy();
  });

  it('supports keyboard navigation, selection, and closing results', async () => {
    renderProjectForm();
    const search = await screen.findByRole('combobox', {name: 'Search members'});

    await userEvent.type(search, 'bob');
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByText('Bob Builder')).toBeTruthy();
    expect(search).toBeInstanceOf(HTMLInputElement);
    if (!(search instanceof HTMLInputElement)) throw new Error();
    expect(search.value).toBe('');
  });

  it('selects the first result instead of submitting on Enter', async () => {
    const onSubmit = vi.fn<(value: ProjectWriteRequest) => void>();
    renderProjectForm({project: projectFixture, onSubmit});
    const search = await screen.findByRole('combobox', {name: 'Search members'});

    await userEvent.type(search, 'bob');
    await userEvent.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    const selected = screen.getByRole('list', {name: 'Selected team members'});
    expect(within(selected).getByText('Bob Builder')).toBeTruthy();
  });
});

function renderProjectForm({
  project,
  onSubmit = () => {},
  users = [alice, bob],
}: {
  project?: ProjectDetail;
  onSubmit?: (value: ProjectWriteRequest) => void;
  users?: ProjectMember[];
} = {}) {
  fetchMock.mockResolvedValue(
    json({
      groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
      users,
    }),
  );
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(
    <QueryClientProvider client={client}>
      <ProjectForm
        yearId="2026"
        project={project}
        saving={false}
        error={null}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  );
}

function json<T>(value: T) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}

const alice = {
  id: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Example',
  avatarUrl: null,
  role: 'member' as const,
  actualRole: 'member' as const,
};

const bob = {
  id: 'bob',
  email: 'bob.builder@sentry.io',
  displayName: 'Bob Builder',
  avatarUrl: null,
  role: 'member' as const,
  actualRole: 'member' as const,
};

const projectFixture: ProjectDetail = {
  id: 'project',
  yearId: '2026',
  name: 'A small machine',
  summary: 'A useful experiment.',
  repository: null,
  kind: 'project',
  needsHelp: false,
  helpDetails: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  creator: alice,
  group: {id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1},
  members: [alice],
  mediaCount: 0,
  media: [],
  permissions: {
    canEdit: true,
    canDelete: true,
    canClaim: false,
    canManageMedia: true,
    canVote: false,
  },
};
