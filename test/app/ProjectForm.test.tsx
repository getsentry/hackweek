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
const confirmMock = vi.fn<typeof window.confirm>();
vi.stubGlobal('confirm', confirmMock);

afterEach(() => {
  fetchMock.mockReset();
  confirmMock.mockReset();
});

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

describe('ProjectForm award targeting', () => {
  it('defaults new projects to all award categories and submits an empty set', async () => {
    const onSubmit = vi.fn<(value: ProjectWriteRequest) => void>();
    renderProjectForm({onSubmit, categories: awardCategories});

    const allCategories = await screen.findByRole('radio', {
      name: /All award categories/,
    });
    expect(allCategories).toHaveProperty('checked', true);

    await userEvent.type(screen.getByLabelText('Name'), 'Fresh project');
    await userEvent.type(screen.getByLabelText(/^Summary/), 'A new experiment.');
    await userEvent.selectOptions(screen.getByLabelText('Group'), 'group');
    await userEvent.click(screen.getByRole('button', {name: 'Create project'}));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({nominationCategoryIds: []}),
    );
  });

  it('allows one or two focused categories in selection order and prevents a third', async () => {
    const onSubmit = vi.fn<(value: ProjectWriteRequest) => void>();
    renderProjectForm({project: projectFixture, onSubmit, categories: awardCategories});

    await userEvent.click(
      await screen.findByRole('radio', {name: /Focus on specific awards/}),
    );
    const craft = screen.getByRole('checkbox', {name: /Craft prize/});
    const impact = screen.getByRole('checkbox', {name: /Biggest impact/});
    const moonshot = screen.getByRole('checkbox', {name: /Moonshot/});
    await userEvent.click(craft);
    await userEvent.click(impact);

    expect(screen.getByText('2 of 2 selected')).toBeTruthy();
    expect(moonshot).toHaveProperty('disabled', true);

    await userEvent.click(screen.getByRole('button', {name: 'Save changes'}));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        nominationCategoryIds: ['craft', 'impact'],
      }),
    );

    await userEvent.click(craft);
    expect(moonshot).toHaveProperty('disabled', false);
  });

  it('requires a category before submitting focused mode', async () => {
    const onSubmit = vi.fn<(value: ProjectWriteRequest) => void>();
    renderProjectForm({project: projectFixture, onSubmit, categories: awardCategories});

    await userEvent.click(
      await screen.findByRole('radio', {name: /Focus on specific awards/}),
    );
    await userEvent.click(screen.getByRole('button', {name: 'Save changes'}));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('0 of 2 selected')).toBeTruthy();
  });

  it('initializes edit mode from saved nominations', async () => {
    renderProjectForm({
      project: {...projectFixture, nominationCategoryIds: ['impact', 'craft']},
      categories: awardCategories,
    });

    expect(
      await screen.findByRole('radio', {name: /Focus on specific awards/}),
    ).toHaveProperty('checked', true);
    expect(screen.getByRole('checkbox', {name: /Biggest impact/})).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByRole('checkbox', {name: /Craft prize/})).toHaveProperty(
      'checked',
      true,
    );
  });

  it('hides targeting for ideas and restores the all-category default when claimed', async () => {
    const idea = {
      ...projectFixture,
      kind: 'idea' as const,
      group: null,
      members: [],
      nominationCategoryIds: [],
    };
    const ideaForm = renderProjectForm({project: idea, categories: awardCategories});

    await screen.findByLabelText('Name');
    expect(screen.queryByRole('group', {name: 'Award targeting'})).toBeNull();
    ideaForm.unmount();

    renderProjectForm({project: idea, claim: true, categories: awardCategories});
    expect(
      await screen.findByRole('radio', {name: /All award categories/}),
    ).toHaveProperty('checked', true);
    expect(screen.getByRole('button', {name: 'Claim project'})).toBeTruthy();
  });

  it('treats mode and category changes as unsaved edits', async () => {
    const onCancel = vi.fn();
    confirmMock.mockReturnValue(false);
    renderProjectForm({
      project: projectFixture,
      onCancel,
      categories: awardCategories,
    });

    await userEvent.click(
      await screen.findByRole('radio', {name: /Focus on specific awards/}),
    );
    await userEvent.click(screen.getByRole('checkbox', {name: /Moonshot/}));
    await userEvent.click(screen.getByRole('button', {name: 'Never mind'}));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows saved targeting as read-only while voting is open', async () => {
    const onSubmit = vi.fn<(value: ProjectWriteRequest) => void>();
    renderProjectForm({
      project: {...projectFixture, nominationCategoryIds: ['moonshot']},
      onSubmit,
      categories: awardCategories,
      nominationsReadOnly: true,
    });

    expect((await screen.findByRole('note')).textContent).toContain('Voting is open.');
    expect(screen.getByRole('radio', {name: /Focus on specific awards/})).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('checkbox', {name: /Moonshot/})).toHaveProperty(
      'disabled',
      true,
    );

    await userEvent.type(screen.getByLabelText('Name'), '!');
    await userEvent.click(screen.getByRole('button', {name: 'Save changes'}));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({nominationCategoryIds: ['moonshot']}),
    );
  });

  it('keeps all categories selected when no category options exist', async () => {
    renderProjectForm({project: projectFixture, categories: []});

    expect(
      await screen.findByRole('radio', {name: /All award categories/}),
    ).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', {name: /Focus on specific awards/})).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('No award categories are available yet.')).toBeTruthy();
  });

  it('supports keyboard selection through native award controls', async () => {
    renderProjectForm({project: projectFixture, categories: awardCategories});
    const focusedMode = await screen.findByRole('radio', {
      name: /Focus on specific awards/,
    });

    focusedMode.focus();
    await userEvent.keyboard(' ');
    const moonshot = screen.getByRole('checkbox', {name: /Moonshot/});
    moonshot.focus();
    await userEvent.keyboard(' ');

    expect(focusedMode).toHaveProperty('checked', true);
    expect(moonshot).toHaveProperty('checked', true);
  });
});

describe('ProjectForm cancel confirmation', () => {
  it('cancels without confirmation when nothing has been edited', async () => {
    const onCancel = vi.fn();
    renderProjectForm({project: projectFixture, onCancel});

    await userEvent.click(await screen.findByRole('button', {name: 'Never mind'}));

    expect(confirmMock).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the edited form when the discard confirmation is declined', async () => {
    const onCancel = vi.fn();
    confirmMock.mockReturnValue(false);
    renderProjectForm({project: projectFixture, onCancel});

    await userEvent.type(await screen.findByLabelText('Name'), '!');
    await userEvent.click(screen.getByRole('button', {name: 'Never mind'}));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveProperty(
      'value',
      `${projectFixture.name}!`,
    );
  });

  it('cancels an edited form when the discard confirmation is accepted', async () => {
    const onCancel = vi.fn();
    confirmMock.mockReturnValue(true);
    renderProjectForm({project: projectFixture, onCancel});

    await userEvent.type(await screen.findByLabelText('Name'), '!');
    await userEvent.click(screen.getByRole('button', {name: 'Never mind'}));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirms before discarding a team change on an otherwise untouched form', async () => {
    const onCancel = vi.fn();
    confirmMock.mockReturnValue(false);
    renderProjectForm({project: projectFixture, onCancel});

    await userEvent.click(
      await screen.findByRole('button', {name: 'Remove Alice Example from team'}),
    );
    await userEvent.click(screen.getByRole('button', {name: 'Never mind'}));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

function renderProjectForm({
  project,
  onCancel = () => {},
  onSubmit = () => {},
  users = [alice, bob],
  categories = [],
  claim = false,
  nominationsReadOnly = false,
}: {
  project?: ProjectDetail;
  onCancel?: () => void;
  onSubmit?: (value: ProjectWriteRequest) => void;
  users?: ProjectMember[];
  categories?: Array<{id: string; yearId: string; name: string}>;
  claim?: boolean;
  nominationsReadOnly?: boolean;
} = {}) {
  fetchMock.mockResolvedValue(
    json({
      groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
      users,
      categories,
    }),
  );
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(
    <QueryClientProvider client={client}>
      <ProjectForm
        yearId="2026"
        project={project}
        claim={claim}
        saving={false}
        error={null}
        nominationsReadOnly={nominationsReadOnly}
        onCancel={onCancel}
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

const awardCategories = [
  {id: 'moonshot', yearId: '2026', name: 'Moonshot'},
  {id: 'craft', yearId: '2026', name: 'Craft prize'},
  {id: 'impact', yearId: '2026', name: 'Biggest impact'},
];

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
  hasVideo: false,
  media: [],
  nominationCategoryIds: [],
  permissions: {
    canEdit: true,
    canDelete: true,
    canClaim: false,
    canManageMedia: true,
    canVote: false,
  },
};
