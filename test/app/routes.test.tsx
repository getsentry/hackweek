import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppLayout} from '../../src/app/components/AppLayout';
import {ProjectDetailsPage} from '../../src/app/routes/ProjectDetailsPage';
import {ProjectsPage} from '../../src/app/routes/ProjectsPage';
import {YearsPage} from '../../src/app/routes/YearsPage';
import type {ProjectDetail} from '../../src/shared/projects';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

describe('clickable project routes', () => {
  it('renders the legacy Hackweek masthead with accessible navigation and identity', () => {
    renderRoute(
      <AppLayout
        user={{
          id: 'member',
          email: 'member@sentry.io',
          displayName: 'Member One',
          avatarUrl: null,
          role: 'admin',
          actualRole: 'admin',
        }}
        onViewModeChange={async () => {}}
      >
        <main>content</main>
      </AppLayout>,
      '/years',
    );

    const wordmark = screen.getByRole('link', {name: 'Sentry Hackweek archives'});
    expect(wordmark.textContent).toBe('#HACKWEEK');
    expect(wordmark.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(screen.getByRole('navigation', {name: 'Primary navigation'})).toBeTruthy();
    expect(screen.getByLabelText('signed in as Member One, admin')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'switch to user view'})).toBeTruthy();
  });

  it('only shows the view mode switch to underlying admins', () => {
    renderRoute(
      <AppLayout
        user={{
          id: 'member',
          email: 'member@sentry.io',
          displayName: 'Member One',
          avatarUrl: null,
          role: 'member',
          actualRole: 'member',
        }}
        onViewModeChange={async () => {}}
      >
        <main>content</main>
      </AppLayout>,
      '/years',
    );

    expect(screen.queryByText(/viewing as/)).toBeNull();
    expect(screen.queryByRole('button', {name: /user view|back to admin/})).toBeNull();
  });

  it('renders the archive empty state accessibly', async () => {
    fetchMock.mockResolvedValue(json({years: []}));

    renderRoute(<YearsPage />, '/years');

    expect(
      await screen.findByRole('heading', {name: 'No years are in the archive yet'}),
    ).toBeTruthy();
  });

  it('uses a tracked year banner and links archive metadata to the project route', async () => {
    fetchMock.mockResolvedValue(
      json({
        years: [
          {
            id: '2024',
            votingEnabled: false,
            submissionsClosed: true,
            projectCount: 2,
            ideaCount: 1,
            groupCount: 1,
            participantCount: 3,
          },
        ],
      }),
    );

    renderRoute(<YearsPage />, '/years');

    const banner = await screen.findByAltText('2024 Hackweek banner');
    expect(banner.getAttribute('src')).toContain('year-2024.png');
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByRole('link', {name: /view archive/}).getAttribute('href')).toBe(
      '/years/2024/projects',
    );
  });

  it('promotes the latest year to the hero and renders earlier years as archives', async () => {
    fetchMock.mockResolvedValue(
      json({
        years: [
          {
            id: '2025',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 4,
            ideaCount: 2,
            groupCount: 1,
            participantCount: 8,
          },
          {
            id: '2024',
            votingEnabled: false,
            submissionsClosed: true,
            projectCount: 2,
            ideaCount: 1,
            groupCount: 1,
            participantCount: 3,
          },
          {
            id: '2023',
            votingEnabled: false,
            submissionsClosed: true,
            projectCount: 1,
            ideaCount: 0,
            groupCount: 1,
            participantCount: 2,
          },
        ],
      }),
    );

    renderRoute(<YearsPage />, '/years');

    const hero = await screen.findByRole('region', {name: 'Hackweek 2025'});
    expect(within(hero).getByRole('heading', {name: 'Hackweek 2025'})).toBeTruthy();
    expect(within(hero).getByText('8')).toBeTruthy();
    expect(hero.querySelector('.yearBanner, .yearBannerFallback')).toBeTruthy();
    expect(
      within(hero)
        .getByRole('link', {name: /submissions open/})
        .getAttribute('href'),
    ).toBe('/years/2025/projects');

    const archives = screen.getByRole('region', {name: 'Archives'});
    expect(
      within(archives).getByRole('link', {name: /2024 Hackweek banner/}),
    ).toBeTruthy();
    expect(
      within(archives).getByRole('link', {name: /2023.*2 participants/}),
    ).toBeTruthy();
    expect(within(archives).queryByText('2025')).toBeNull();
  });

  it('moves between project and idea query state from the route controls', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 1,
            ideaCount: 1,
            groupCount: 1,
            participantCount: 1,
          },
          groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
          awards: [],
        });
      }
      return json({
        projects: url.includes('kind=idea')
          ? [
              {
                ...projectFixture,
                id: 'idea',
                name: 'Open signal',
                kind: 'idea',
                group: null,
                members: [],
              },
            ]
          : [projectFixture],
        nextCursor: null,
      });
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');
    const projectHeading = await screen.findByRole('heading', {name: 'A small machine'});
    expect(projectHeading.closest('.projectCard')).toBeTruthy();
    expect(screen.getByRole('region', {name: 'project list'})).toBeTruthy();

    await userEvent.click(screen.getByRole('button', {name: /Ideas/}));

    expect(await screen.findByRole('heading', {name: 'Open signal'})).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('kind=idea'),
      undefined,
    );
  });

  it('renders an idea with no video and exposes the server claim permission', async () => {
    fetchMock.mockResolvedValue(
      json({
        project: {
          ...projectFixture,
          id: 'idea',
          kind: 'idea',
          group: null,
          members: [],
          media: [],
          permissions: {
            canEdit: false,
            canDelete: false,
            canClaim: true,
            canManageMedia: false,
          },
        },
      }),
    );

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/idea',
      '/years/:yearId/projects/:projectId',
    );

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    expect(
      screen.getByRole('link', {name: 'Claim this idea'}).getAttribute('href'),
    ).toContain('?claim');
  });

  it('uploads media and refreshes project query state', async () => {
    const detail = {
      ...projectFixture,
      media: [],
      permissions: {
        canEdit: true,
        canDelete: true,
        canClaim: false,
        canManageMedia: true,
      },
    };
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST')
        return json({media: {id: 'media', originalName: 'proof.txt'}}, 201);
      return json({project: detail});
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );
    const input = await screen.findByLabelText('Add media');
    await userEvent.upload(input, new File(['proof'], 'proof.txt', {type: 'text/plain'}));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/media/projects/project',
        expect.objectContaining({method: 'POST'}),
      ),
    );
  });
});

function renderRoute(element: ReactNode, path: string, pattern = path) {
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

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

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
  creator: {
    id: 'member',
    email: 'member@sentry.io',
    displayName: 'Member One',
    avatarUrl: null,
    role: 'member',
    actualRole: 'member',
  },
  group: {id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1},
  members: [
    {
      id: 'member',
      email: 'member@sentry.io',
      displayName: 'Member One',
      avatarUrl: null,
      role: 'member',
      actualRole: 'member',
    },
  ],
  mediaCount: 0,
  media: [],
  permissions: {canEdit: true, canDelete: true, canClaim: false, canManageMedia: true},
};
