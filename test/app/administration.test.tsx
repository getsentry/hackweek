import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AdminAnalyticsPage} from '../../src/app/routes/AdminAnalyticsPage';
import {AdminPage} from '../../src/app/routes/AdminPage';
import {VotingPage} from '../../src/app/routes/VotingPage';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

describe('voting and administration journeys', () => {
  it('renders compact Markdown in voting cards', async () => {
    fetchMock.mockResolvedValue(
      json({
        ...votingFixture,
        projects: [
          {
            ...votingFixture.projects[0],
            summary: '**Working** details at [the docs](https://example.com).',
          },
        ],
      }),
    );
    renderRoute(<VotingPage />, '/years/2026/vote', '/years/:yearId/vote');

    expect((await screen.findByText('Working')).tagName).toBe('STRONG');
    const link = screen.getByRole('link', {name: 'the docs'});
    expect(link.closest('.markdown')?.classList.contains('markdown--compact')).toBe(true);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('moves an existing vote to the selected project through the API', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'PUT') return json({vote: {...vote, projectId: 'project-2'}});
      return json(votingFixture);
    });
    renderRoute(<VotingPage />, '/years/2026/vote', '/years/:yearId/vote');

    expect(await screen.findByText('First project')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', {name: 'Move vote'}));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/votes/vote-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            yearId: '2026',
            projectId: 'project-2',
            categoryId: 'category-1',
          }),
        }),
      ),
    );
  });

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

const vote = {
  id: 'vote-1',
  yearId: '2026',
  projectId: 'project-1',
  categoryId: 'category-1',
};
const votingFixture = {
  year: {id: '2026', votingEnabled: true},
  categories: [{id: 'category-1', yearId: '2026', name: 'Delight'}],
  projects: [
    {
      id: 'project-1',
      name: 'First project',
      summary: 'One.',
      groupName: 'Orbital',
      memberNames: ['A'],
      nominations: [{categoryId: 'category-1', position: 1}],
      eligible: true,
    },
    {
      id: 'project-2',
      name: 'Second project',
      summary: 'Two.',
      groupName: null,
      memberNames: ['B'],
      nominations: [{categoryId: 'category-1', position: 1}],
      eligible: true,
    },
  ],
  votes: [vote],
};
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
