import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ProjectVoting} from '../../src/app/components/ProjectVoting';
import {useBallotStatus} from '../../src/app/queries/administration';
import {AdminAnalyticsPage} from '../../src/app/routes/AdminAnalyticsPage';
import {AdminPage} from '../../src/app/routes/AdminPage';
import type {BallotStatusResponse} from '../../src/shared/administration';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

describe('voting and administration journeys', () => {
  it('renders admin controls and sends year/category changes to aggregate APIs', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (init?.method === 'PUT' && url.includes('/admin/years/2026'))
        return json({year: adminFixture.year});
      if (init?.method === 'POST')
        return json({category: {id: 'new', yearId: '2026', name: 'New category'}}, 201);
      return json(adminFixture);
    });
    renderRoute(<AdminPage />, '/admin/years/2026', '/admin/years/:yearId');

    const submissions = await screen.findByRole('checkbox', {name: 'Submissions closed'});
    expect(screen.queryByRole('heading', {name: 'Project nominations'})).toBeNull();
    await userEvent.click(submissions);
    await userEvent.type(screen.getByLabelText('Category name'), 'New category');
    await userEvent.click(screen.getByRole('button', {name: 'Add category'}));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/years/2026',
        expect.objectContaining({method: 'PUT'}),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/years/2026/categories',
        expect.objectContaining({method: 'POST'}),
      );
    });
  });

  it('shows archived year settings as locked', async () => {
    fetchMock.mockResolvedValue(
      json({
        ...adminFixture,
        year: {
          id: '2025',
          votingEnabled: false,
          submissionsClosed: true,
          isCurrent: false,
        },
      }),
    );
    renderRoute(<AdminPage />, '/admin/years/2025', '/admin/years/:yearId');

    expect(await screen.findByText(/This year is archived/)).toBeTruthy();
    const submissionsClosed = screen.getByRole('checkbox', {
      name: 'Submissions closed',
    });
    const votingEnabled = screen.getByRole('checkbox', {name: 'Voting enabled'});
    expect(submissionsClosed).toBeInstanceOf(HTMLInputElement);
    expect(votingEnabled).toBeInstanceOf(HTMLInputElement);
    if (!(submissionsClosed instanceof HTMLInputElement)) throw new Error();
    if (!(votingEnabled instanceof HTMLInputElement)) throw new Error();
    expect(submissionsClosed.disabled).toBe(true);
    expect(votingEnabled.disabled).toBe(true);
  });

  it('casts a first vote and requires an explicit confirmed move', async () => {
    let ballotReads = 0;
    let ballot: BallotStatusResponse = {
      year: {id: '2026', votingEnabled: true},
      categories: [
        {id: 'delight', yearId: '2026', name: 'Delight'},
        {id: 'impact', yearId: '2026', name: 'Impact'},
        {id: 'craft', yearId: '2026', name: 'Craft'},
      ],
      votes: [
        {
          id: 'vote-impact',
          yearId: '2026',
          projectId: 'project',
          projectName: 'A small machine',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'impact',
        },
        {
          id: 'vote-craft',
          yearId: '2026',
          projectId: 'other-project',
          projectName: 'Quiet hours',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'craft',
        },
      ],
    };
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url.includes('/api/votes?')) {
        ballotReads += 1;
        return json(ballot);
      }
      if (url === '/api/votes' && init?.method === 'POST') {
        const selection = {
          id: 'vote-delight',
          yearId: '2026',
          projectId: 'project',
          projectName: 'A small machine',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'delight',
        };
        ballot = {...ballot, votes: [...ballot.votes, selection]};
        return json({vote: selection}, 201);
      }
      if (url === '/api/votes/vote-craft' && init?.method === 'PUT') {
        const selection = {
          id: 'vote-craft',
          yearId: '2026',
          projectId: 'project',
          projectName: 'A small machine',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'craft',
        };
        ballot = {
          ...ballot,
          votes: ballot.votes.map((item) =>
            item.id === 'vote-craft' ? selection : item,
          ),
        };
        return json({vote: selection});
      }
      throw new Error(`unexpected request: ${url}`);
    });

    renderRoute(<VotingHarness />, '/', '/');

    const voting = await screen.findByRole('region', {name: 'vote for this project'});
    const impactRow = within(voting).getByRole('heading', {name: 'Impact'}).closest('li');
    expect(impactRow).toBeTruthy();
    if (!(impactRow instanceof HTMLElement)) throw new Error();
    expect(within(impactRow).getByText('your vote')).toBeTruthy();
    expect(within(impactRow).queryByRole('button')).toBeNull();

    await userEvent.click(
      within(voting).getByRole('button', {
        name: /vote for delight/i,
      }),
    );

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([input, init]) => input === '/api/votes' && init?.method === 'POST',
      );
      expect(request).toBeTruthy();
      expect(request?.[1]?.body).toBe(
        JSON.stringify({
          yearId: '2026',
          projectId: 'project',
          categoryId: 'delight',
        }),
      );
      expect(ballotReads).toBeGreaterThanOrEqual(2);
    });
    expect(
      await within(voting).findByText('your Delight vote is now on A small machine.'),
    ).toBeTruthy();
    const delightRow = within(voting)
      .getByRole('heading', {name: 'Delight'})
      .closest('li');
    expect(delightRow).toBeTruthy();
    if (!(delightRow instanceof HTMLElement)) throw new Error();
    expect(within(delightRow).getByText('your vote')).toBeTruthy();

    await userEvent.click(within(voting).getByRole('button', {name: 'move vote here'}));
    expect(within(voting).getByText(/move your Craft vote from/).textContent).toContain(
      'Quiet hours',
    );
    await userEvent.click(within(voting).getByRole('button', {name: 'cancel'}));
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => input === '/api/votes/vote-craft' && init?.method === 'PUT',
      ),
    ).toBe(false);
    expect(within(voting).queryByRole('button', {name: 'confirm move'})).toBeNull();

    await userEvent.click(within(voting).getByRole('button', {name: 'move vote here'}));
    await userEvent.click(within(voting).getByRole('button', {name: 'confirm move'}));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([input, init]) => input === '/api/votes/vote-craft' && init?.method === 'PUT',
      );
      expect(request).toBeTruthy();
      expect(request?.[1]?.body).toBe(
        JSON.stringify({
          yearId: '2026',
          projectId: 'project',
          categoryId: 'craft',
        }),
      );
      expect(ballotReads).toBeGreaterThanOrEqual(3);
    });
    expect(
      await within(voting).findByText('your Craft vote is now on A small machine.'),
    ).toBeTruthy();
  });

  it('keeps every category visible but only offers restricted project nominations', () => {
    const ballot: BallotStatusResponse = {
      year: {id: '2026', votingEnabled: true},
      categories: [
        {id: 'delight', yearId: '2026', name: 'Delight'},
        {id: 'impact', yearId: '2026', name: 'Impact'},
        {id: 'craft', yearId: '2026', name: 'Craft'},
      ],
      votes: [
        {
          id: 'vote-delight',
          yearId: '2026',
          projectId: 'legacy-project',
          projectName: 'Legacy project',
          projectActive: true,
          nominationEligible: false,
          categoryId: 'delight',
        },
        {
          id: 'vote-impact',
          yearId: '2026',
          projectId: 'project',
          projectName: 'A small machine',
          projectActive: true,
          nominationEligible: false,
          categoryId: 'impact',
        },
        {
          id: 'vote-craft',
          yearId: '2026',
          projectId: 'other-project',
          projectName: 'Quiet hours',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'craft',
        },
      ],
    };

    renderRoute(
      <ProjectVoting
        ballot={ballot}
        project={{
          id: 'project',
          name: 'A small machine',
          yearId: '2026',
          canVote: true,
          nominationCategoryIds: ['delight'],
        }}
      />,
      '/',
      '/',
    );

    const voting = screen.getByRole('region', {name: 'vote for this project'});
    expect(within(voting).getAllByRole('listitem')).toHaveLength(3);
    expect(within(voting).getByRole('button', {name: 'replace vote here'})).toBeTruthy();
    expect(
      within(voting).getByText('no longer eligible — replace this pick'),
    ).toBeTruthy();

    const impact = within(voting).getByRole('heading', {name: 'Impact'}).closest('li');
    const craft = within(voting).getByRole('heading', {name: 'Craft'}).closest('li');
    expect(impact).toBeTruthy();
    expect(craft).toBeTruthy();
    if (!(impact instanceof HTMLElement) || !(craft instanceof HTMLElement))
      throw new Error();
    expect(impact.getAttribute('aria-disabled')).toBe('true');
    expect(craft.getAttribute('aria-disabled')).toBe('true');
    expect(within(impact).getByText('your current pick needs replacement')).toBeTruthy();
    expect(
      within(impact).getByText('the project team did not enter this award category.'),
    ).toBeTruthy();
    expect(within(impact).queryByRole('button')).toBeNull();
    expect(within(craft).getByText('not entered for this project')).toBeTruthy();
    expect(
      within(craft).getByText('the project team chose other award categories.'),
    ).toBeTruthy();
    expect(within(craft).queryByRole('button')).toBeNull();
  });

  it('reports a pending first vote, keeps errors local, and reconciles conflicts', async () => {
    let resolveVote!: (response: Response) => void;
    const pendingVote = new Promise<Response>((resolve) => {
      resolveVote = resolve;
    });
    let ballot: BallotStatusResponse = {
      year: {id: '2026', votingEnabled: true},
      categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
      votes: [],
    };
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url.includes('/api/votes?')) return json(ballot);
      if (url === '/api/votes' && init?.method === 'POST') return pendingVote;
      throw new Error(`unexpected request: ${url}`);
    });

    renderRoute(<VotingHarness />, '/', '/');
    const voting = await screen.findByRole('region', {name: 'vote for this project'});
    await userEvent.click(
      within(voting).getByRole('button', {
        name: /vote for delight/i,
      }),
    );

    const pending = await within(voting).findByRole('button', {
      name: 'casting your vote…',
    });
    expect(within(voting).getByRole('status').textContent).toContain(
      'casting your Delight vote…',
    );
    expect(pending).toBeInstanceOf(HTMLButtonElement);
    if (!(pending instanceof HTMLButtonElement)) throw new Error();
    expect(pending.disabled).toBe(true);

    await act(async () => {
      ballot = {
        ...ballot,
        votes: [
          {
            id: 'vote-delight',
            yearId: '2026',
            projectId: 'other-project',
            projectName: 'Quiet hours',
            projectActive: true,
            nominationEligible: true,
            categoryId: 'delight',
          },
        ],
      };
      resolveVote(
        json(
          {error: {code: 'VOTE_CONFLICT', message: 'This vote changed elsewhere'}},
          409,
        ),
      );
    });

    expect((await within(voting).findByRole('alert')).textContent).toContain(
      'This vote changed elsewhere',
    );
    expect(
      await within(voting).findByRole('button', {name: 'move vote here'}),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', {name: 'Something went wrong'})).toBeNull();
  });

  it('renders D1 aggregate analytics without raw vote identities', async () => {
    fetchMock.mockResolvedValue(
      json({
        years: [
          {
            yearId: '2026',
            activeVoters: 14,
            voteCount: 28,
            projectCount: 9,
            ideaCount: 2,
            categoryCount: 2,
            awardCount: 2,
          },
        ],
        voteResults: [
          {
            categoryId: 'cat',
            categoryName: 'Delight',
            projectId: 'project',
            projectName: 'First project',
            groupName: 'Orbital',
            voteCount: 8,
          },
        ],
      }),
    );
    renderRoute(<AdminAnalyticsPage />, '/admin/analytics?year=2026', '/admin/analytics');

    expect(await screen.findByText('Active voters')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByRole('cell', {name: 'First project'})).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics?year=2026', undefined);
  });
});

function requestUrl(input: string | URL | Request) {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : input;
}

function VotingHarness() {
  const ballot = useBallotStatus('2026');
  if (!ballot.data) return null;
  return (
    <ProjectVoting
      ballot={ballot.data}
      project={{
        id: 'project',
        name: 'A small machine',
        yearId: '2026',
        canVote: true,
        nominationCategoryIds: [],
      }}
    />
  );
}

function renderRoute(element: ReactNode, path: string, pattern: string) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const {hook} = memoryLocation({path});
  return render(
    <Router hook={hook}>
      <QueryClientProvider client={client}>
        <Route path={pattern}>{element}</Route>
      </QueryClientProvider>
    </Router>,
  );
}

function json<T>(value: T, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

const adminFixture = {
  year: {
    id: '2026',
    votingEnabled: true,
    submissionsClosed: false,
    isCurrent: true,
  },
  categories: [{id: 'category-1', yearId: '2026', name: 'Delight'}],
  awards: [],
  projects: [{id: 'project-1', name: 'First project', videoStatus: null}],
  screeningOrder: [],
};
