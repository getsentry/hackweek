import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {ProjectDetail} from '../../src/shared/projects';
import {ProjectDetailsPage} from '../../src/app/routes/ProjectDetailsPage';
import {ProjectsPage} from '../../src/app/routes/ProjectsPage';
import {YearsPage} from '../../src/app/routes/YearsPage';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

describe('clickable project routes', () => {
  it('renders the archive empty state accessibly', async () => {
    fetchMock.mockResolvedValue(json({years: []}));

    renderRoute(<YearsPage />, '/years');

    expect(
      await screen.findByRole('heading', {name: 'No years are in the archive yet'}),
    ).toBeTruthy();
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
          },
          groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
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
    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();

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
  },
  group: {id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1},
  members: [
    {
      id: 'member',
      email: 'member@sentry.io',
      displayName: 'Member One',
      avatarUrl: null,
      role: 'member',
    },
  ],
  mediaCount: 0,
  media: [],
  permissions: {canEdit: true, canDelete: true, canClaim: false, canManageMedia: true},
};
