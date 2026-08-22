import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Router} from 'wouter';
import {memoryLocation} from 'wouter/memory-location';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppLayout} from '../../src/app/components/AppLayout';
import {ProjectCard} from '../../src/app/components/ProjectCard';
import {ProjectDetailsPage} from '../../src/app/routes/ProjectDetailsPage';
import {ProjectsPage} from '../../src/app/routes/ProjectsPage';
import {YearsPage} from '../../src/app/routes/YearsPage';
import type {BallotStatusResponse} from '../../src/shared/administration';
import type {ProjectDetail} from '../../src/shared/projects';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  window.localStorage.removeItem('hackweek.projectsView');
});

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

  it('shows voting open as the current-year action while voting is enabled', async () => {
    fetchMock.mockResolvedValue(
      json({
        years: [
          {
            id: '2026',
            votingEnabled: true,
            submissionsClosed: false,
            projectCount: 4,
            ideaCount: 2,
            groupCount: 1,
            participantCount: 8,
          },
        ],
      }),
    );

    renderRoute(<YearsPage />, '/years');

    const hero = await screen.findByRole('region', {name: 'Hackweek 2026'});
    expect(within(hero).getByRole('link', {name: /voting open/})).toBeTruthy();
    expect(within(hero).queryByRole('link', {name: /submissions open/})).toBeNull();
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

  it('reveals the screening reel to admins or after submissions close', async () => {
    let submissionsClosed = false;
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: true,
            submissionsClosed,
            projectCount: 0,
            ideaCount: 0,
            groupCount: 0,
            participantCount: 0,
          },
          groups: [],
          awards: [],
          myProjects: [],
        });
      }
      if (url.includes('/api/votes?')) {
        return json({
          year: {id: '2026', votingEnabled: true},
          categories: [],
          votes: [],
        });
      }
      return json({projects: [], nextCursor: null});
    });

    const member = renderRoute(
      <ProjectsPage />,
      '/years/2026/projects',
      '/years/:yearId/projects',
    );
    expect(await screen.findByRole('heading', {name: 'projects & ideas'})).toBeTruthy();
    expect(screen.queryByRole('link', {name: 'watch reel'})).toBeNull();
    expect(screen.queryByRole('link', {name: 'vote'})).toBeNull();
    member.unmount();

    const admin = renderRoute(
      <ProjectsPage isAdmin />,
      '/years/2026/projects',
      '/years/:yearId/projects',
    );
    expect(await screen.findByRole('link', {name: 'watch reel'})).toBeTruthy();
    admin.unmount();

    submissionsClosed = true;
    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');
    expect(await screen.findByRole('link', {name: 'watch reel'})).toBeTruthy();
  });

  it('shows progress, links active picks, and identifies withdrawn picks', async () => {
    mockProjectsOverview({
      categories: [
        {id: 'delight', yearId: '2026', name: 'Delight'},
        {id: 'impact', yearId: '2026', name: 'Impact'},
        {id: 'craft', yearId: '2026', name: 'Craft'},
      ],
      votes: [
        {
          id: 'vote-1',
          yearId: '2026',
          projectId: 'signal-forge',
          projectName: 'Signal forge',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'delight',
        },
        {
          id: 'vote-2',
          yearId: '2026',
          projectId: 'quiet-hours',
          projectName: 'Quiet hours',
          projectActive: false,
          nominationEligible: true,
          categoryId: 'impact',
        },
      ],
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    const ballot = await screen.findByRole('region', {name: 'your ballot'});
    const counts = within(ballot).getByLabelText('Ballot counts');
    expect(counts.textContent).toContain('1 vote cast');
    expect(counts.textContent).toContain('2 votes remaining');
    expect(
      within(ballot).getByText(
        '1 withdrawn pick needs a new project — 2 votes left to cast.',
      ),
    ).toBeTruthy();
    const progress = within(ballot).getByRole('progressbar', {
      name: 'ballot progress',
    });
    expect(progress.getAttribute('value')).toBe('1');
    expect(progress.getAttribute('max')).toBe('3');
    expect(
      within(ballot)
        .getByRole('link', {name: /Signal forge/})
        .getAttribute('href'),
    ).toBe('/years/2026/projects/signal-forge');
    expect(within(ballot).queryByRole('link', {name: /Quiet hours/})).toBeNull();
    expect(within(ballot).getByText('Quiet hours')).toBeTruthy();
    expect(
      within(ballot).getByText('project withdrawn — choose another project'),
    ).toBeTruthy();
    expect(within(ballot).getAllByRole('link')).toHaveLength(1);
  });

  it('requires replacement of active ineligible picks and omits their badges', async () => {
    mockProjectsOverview({
      categories: [
        {id: 'delight', yearId: '2026', name: 'Delight'},
        {id: 'impact', yearId: '2026', name: 'Impact'},
      ],
      votes: [
        {
          id: 'vote-delight',
          yearId: '2026',
          projectId: 'signal-forge',
          projectName: 'Signal forge',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'delight',
        },
        {
          id: 'vote-impact',
          yearId: '2026',
          projectId: 'stale-pick',
          projectName: 'Stale pick',
          projectActive: true,
          nominationEligible: false,
          categoryId: 'impact',
        },
      ],
      projects: [
        {...projectFixture, id: 'signal-forge', name: 'Signal forge'},
        {...projectFixture, id: 'stale-pick', name: 'Stale pick'},
      ],
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    const ballot = await screen.findByRole('region', {name: 'your ballot'});
    expect(within(ballot).getByLabelText('Ballot counts').textContent).toContain(
      '1 vote cast',
    );
    expect(
      within(ballot).getByText(
        '1 ineligible pick needs a new project — 1 vote left to cast.',
      ),
    ).toBeTruthy();
    expect(
      within(ballot).getByText(
        'project team did not enter this award — choose another project',
      ),
    ).toBeTruthy();
    expect(
      within(ballot)
        .getByRole('progressbar', {name: 'ballot progress'})
        .getAttribute('value'),
    ).toBe('1');

    const validProject = screen
      .getByRole('heading', {name: 'Signal forge'})
      .closest('.projectCard');
    const staleProject = screen
      .getByRole('heading', {name: 'Stale pick'})
      .closest('.projectCard');
    expect(validProject).toBeTruthy();
    expect(staleProject).toBeTruthy();
    if (!(validProject instanceof HTMLElement) || !(staleProject instanceof HTMLElement))
      throw new Error();
    expect(within(validProject).getByLabelText('1 of your pick: Delight')).toBeTruthy();
    expect(within(staleProject).queryByText(/your picks/)).toBeNull();
  });

  it('encourages a first vote and celebrates a completed ballot', async () => {
    mockProjectsOverview({
      categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
    });
    const emptyBallot = renderRoute(
      <ProjectsPage />,
      '/years/2026/projects',
      '/years/:yearId/projects',
    );

    expect(
      await screen.findByText('open a project to cast your first vote.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'open any project that catches your eye and choose a category there.',
      ),
    ).toBeTruthy();
    emptyBallot.unmount();

    fetchMock.mockReset();
    mockProjectsOverview({
      categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
      votes: [
        {
          id: 'vote-1',
          yearId: '2026',
          projectId: 'signal-forge',
          projectName: 'Signal forge',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'delight',
        },
      ],
    });
    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(
      await screen.findByText('ballot complete — every category has your pick.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Ballot counts').textContent).toContain(
      '0 votes remaining',
    );
  });

  it('explains when open voting has no configured categories', async () => {
    mockProjectsOverview({});

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(
      await screen.findByText(
        'award categories are still being set up. check back soon.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'once categories are ready, project pages will be the place to vote.',
      ),
    ).toBeTruthy();
    const progress = screen.getByRole('progressbar', {name: 'ballot progress'});
    expect(progress.getAttribute('value')).toBe('0');
  });

  it('marks personal vote counts in both project views', async () => {
    mockProjectsOverview({
      categories: [
        {id: 'delight', yearId: '2026', name: 'Delight'},
        {id: 'impact', yearId: '2026', name: 'Impact'},
      ],
      votes: [
        {
          id: 'vote-delight',
          yearId: '2026',
          projectId: 'project',
          projectName: 'A small machine',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'delight',
        },
        {
          id: 'vote-impact',
          yearId: '2026',
          projectId: 'project',
          projectName: 'A small machine',
          projectActive: true,
          nominationEligible: true,
          categoryId: 'impact',
        },
      ],
      projects: [projectFixture],
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    const gridBadge = await screen.findByLabelText('2 of your picks: Delight, Impact');
    expect(gridBadge.textContent).toBe('your picks · 2');
    expect(gridBadge.closest('.projectCard')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', {name: 'list view'}));
    const listBadge = screen.getByLabelText('2 of your picks: Delight, Impact');
    expect(listBadge.closest('.projectRow')).toBeTruthy();
  });

  it('tiles owned and attached projects under the page title', async () => {
    const ownedIdea = {
      ...projectFixture,
      id: 'owned-idea',
      name: 'Postcard idea',
      kind: 'idea' as const,
      group: null,
      members: [],
    };
    const attachedProject = {
      ...projectFixture,
      id: 'attached-project',
      name: 'Shared machine',
      creator: {
        ...projectFixture.creator,
        id: 'someone-else',
        displayName: 'Someone Else',
      },
    };
    mockProjectsOverview({
      votingEnabled: false,
      projects: [projectFixture, ownedIdea, attachedProject],
      myProjects: [attachedProject, ownedIdea],
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    const heading = await screen.findByRole('heading', {name: 'projects & ideas'});
    const mine = screen.getByRole('region', {name: 'your projects'});
    expect(
      heading.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(mine).getByText('yours')).toBeTruthy();
    const attached = within(mine).getByRole('link', {name: /Shared machine/});
    expect(attached.getAttribute('href')).toBe('/years/2026/projects/attached-project');
    expect(within(attached).getByLabelText('Member One')).toBeTruthy();
    expect(
      within(mine)
        .getByRole('link', {name: /Postcard idea/})
        .getAttribute('href'),
    ).toBe('/years/2026/projects/owned-idea');
    expect(within(mine).queryByRole('link', {name: /A small machine/})).toBeNull();
  });

  it('hides the personal project tiles when none belong to you', async () => {
    mockProjectsOverview({votingEnabled: false, projects: [projectFixture]});
    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    expect(screen.queryByRole('region', {name: 'your projects'})).toBeNull();
  });

  it('keeps closed-year browsing and ballot read failures local', async () => {
    mockProjectsOverview({votingEnabled: false, projects: [projectFixture]});
    const closed = renderRoute(
      <ProjectsPage />,
      '/years/2026/projects',
      '/years/:yearId/projects',
    );

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    expect(screen.queryByRole('region', {name: 'your ballot'})).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : input.toString();
        return url.includes('/api/votes?');
      }),
    ).toBe(false);
    closed.unmount();

    fetchMock.mockReset();
    mockProjectsOverview({ballotError: true, projects: [projectFixture]});
    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(await screen.findByText('progress is taking a break')).toBeTruthy();
    expect(screen.getByRole('heading', {name: 'A small machine'})).toBeTruthy();
    expect(screen.queryByRole('heading', {name: 'Something went wrong'})).toBeNull();
  });

  it('defaults to the grid view when storage is unavailable', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
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
          myProjects: [],
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

    const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    try {
      renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');
    } finally {
      Object.defineProperty(window, 'localStorage', storageDescriptor);
    }

    const projectHeading = await screen.findByRole('heading', {name: 'A small machine'});
    expect(projectHeading.closest('.projectCard')).toBeTruthy();
    expect(screen.getByRole('region', {name: 'project list'}).className).toBe(
      'projectGrid',
    );
    expect(
      screen.getByRole('button', {name: 'grid view'}).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(window.localStorage.getItem('hackweek.projectsView')).toBeNull();

    const setItem = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementationOnce(() => {
        throw new DOMException('Blocked', 'QuotaExceededError');
      });
    await userEvent.click(screen.getByRole('button', {name: 'list view'}));
    setItem.mockRestore();
    expect(screen.getByRole('region', {name: 'project list'}).className).toBe(
      'projectList',
    );

    await userEvent.click(screen.getByRole('button', {name: /Ideas/}));

    expect(await screen.findByRole('heading', {name: 'Open signal'})).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('kind=idea'),
      undefined,
    );
  });

  it('switches to compact list rows and restores the stored preference', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 1,
            ideaCount: 0,
            groupCount: 1,
            participantCount: 1,
          },
          groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
          awards: [],
          myProjects: [],
        });
      }
      return json({
        projects: [{...projectFixture, needsHelp: true, mediaCount: 2}],
        nextCursor: null,
      });
    });

    const firstRender = renderRoute(
      <ProjectsPage />,
      '/years/2026/projects',
      '/years/:yearId/projects',
    );
    await screen.findByRole('heading', {name: 'A small machine'});

    await userEvent.click(screen.getByRole('button', {name: 'list view'}));

    const list = screen.getByRole('region', {name: 'project list'});
    const row = screen
      .getByRole('heading', {name: 'A small machine'})
      .closest('.projectRow');
    expect(list.className).toBe('projectList');
    expect(row).toBeTruthy();
    if (!(row instanceof HTMLElement)) throw new Error();
    expect(within(row).getByText('Orbital')).toBeTruthy();
    expect(within(row).getByText('looking for help')).toBeTruthy();
    expect(within(row).getByLabelText('Member One')).toBeTruthy();
    expect(within(row).queryByText('2 attachments')).toBeNull();
    expect(within(row).queryByText(projectFixture.summary)).toBeNull();
    expect(window.localStorage.getItem('hackweek.projectsView')).toBe('list');

    firstRender.unmount();
    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    const restoredHeading = await screen.findByRole('heading', {
      name: 'A small machine',
    });
    expect(restoredHeading.closest('.projectRow')).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'list view'}).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('resets pagination when the group filter changes', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 251,
            ideaCount: 0,
            groupCount: 2,
            participantCount: 251,
          },
          groups: [
            {id: 'group-a', yearId: '2026', name: 'Orbital', projectCount: 251},
            {id: 'group-b', yearId: '2026', name: 'Lunar', projectCount: 1},
          ],
          awards: [],
          myProjects: [],
        });
      }

      const projectsUrl = new URL(url, 'https://hackweek.test');
      const group = projectsUrl.searchParams.get('group');
      const cursor = projectsUrl.searchParams.get('cursor');
      if (group === 'group-b') {
        expect(cursor).toBeNull();
        return json({
          projects: [
            {
              ...projectFixture,
              id: 'lunar-1',
              name: 'Lunar one',
              group: {
                id: 'group-b',
                yearId: '2026',
                name: 'Lunar',
                projectCount: 1,
              },
            },
          ],
          nextCursor: null,
        });
      }

      if (cursor === '250') {
        return json({
          projects: [{...projectFixture, id: 'project-251', name: 'Project 251'}],
          nextCursor: null,
        });
      }

      return json({
        projects: Array.from({length: 250}, (_, index) => ({
          ...projectFixture,
          id: `project-${index + 1}`,
          name: `Project ${index + 1}`,
        })),
        nextCursor: '250',
      });
    });

    renderRoute(
      <ProjectsPage />,
      '/years/2026/projects?group=group-a',
      '/years/:yearId/projects',
    );

    expect(await screen.findByRole('heading', {name: 'Project 1'})).toBeTruthy();
    await userEvent.click(screen.getByRole('button', {name: 'next'}));
    expect(await screen.findByRole('heading', {name: 'Project 251'})).toBeTruthy();

    await userEvent.selectOptions(
      screen.getByRole('combobox', {name: 'Group'}),
      'group-b',
    );

    expect(await screen.findByRole('heading', {name: 'Lunar one'})).toBeTruthy();
    await waitFor(() => {
      const lastInput = fetchMock.mock.calls.at(-1)?.[0];
      const lastUrl =
        lastInput instanceof Request ? lastInput.url : lastInput?.toString();
      expect(lastUrl).toContain('group=group-b');
      expect(lastUrl).not.toContain('cursor=');
    });
  });

  it('omits the group filter from idea detail links', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
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
          myProjects: [],
        });
      }
      return json({
        projects: [
          {
            ...projectFixture,
            id: 'idea',
            name: 'Open idea',
            kind: 'idea',
            group: null,
          },
        ],
        nextCursor: null,
      });
    });

    renderRoute(
      <ProjectsPage />,
      '/years/2026/projects?group=group',
      '/years/:yearId/projects',
    );

    await userEvent.click(await screen.findByRole('button', {name: /Ideas/}));
    expect(
      (await screen.findByRole('link', {name: 'Open idea'})).getAttribute('href'),
    ).toBe('/years/2026/projects/idea');
  });

  it('keeps the selected group when viewing a project and returning', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 1,
            ideaCount: 0,
            groupCount: 1,
            participantCount: 1,
          },
          groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
          awards: [],
          myProjects: [],
        });
      }
      expect(new URL(url, 'https://hackweek.test').searchParams.get('group')).toBe(
        'group',
      );
      return json({projects: [projectFixture], nextCursor: null});
    });

    const projects = renderRoute(
      <ProjectsPage />,
      '/years/2026/projects?group=group',
      '/years/:yearId/projects',
    );

    const groupSelect = await screen.findByRole('combobox', {name: 'Group'});
    expect(groupSelect).toBeInstanceOf(HTMLSelectElement);
    if (!(groupSelect instanceof HTMLSelectElement)) throw new Error();
    expect(groupSelect.value).toBe('group');
    expect(screen.getByRole('link', {name: 'A small machine'}).getAttribute('href')).toBe(
      '/years/2026/projects/project?group=group',
    );

    projects.unmount();
    mockProjectDetails({detail: projectFixture});
    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project?group=group',
      '/years/:yearId/projects/:projectId',
    );

    expect(
      (await screen.findByRole('link', {name: '← 2026 projects'})).getAttribute('href'),
    ).toBe('/years/2026/projects?group=group');
  });

  it('requests a 250-item page and focuses and announces loaded pages', async () => {
    let resolveSecondPage!: (response: Response) => void;
    const pendingSecondPage = new Promise<Response>((resolve) => {
      resolveSecondPage = resolve;
    });
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 251,
            ideaCount: 0,
            groupCount: 0,
            participantCount: 251,
          },
          groups: [],
          awards: [],
          myProjects: [],
        });
      }

      const requestUrl = new URL(url, 'https://hackweek.test');
      expect(requestUrl.searchParams.get('limit')).toBe('250');
      const cursor = requestUrl.searchParams.get('cursor');
      if (cursor === '250') return pendingSecondPage;

      return json({
        projects: Array.from({length: 250}, (_, index) => ({
          ...projectFixture,
          id: `project-${index + 1}`,
          name: `Project ${index + 1}`,
        })),
        nextCursor: '250',
      });
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(await screen.findByRole('heading', {name: 'Project 1'})).toBeTruthy();
    expect(screen.getByRole('region', {name: 'project list'}).children).toHaveLength(250);
    expect(screen.getByText('showing 1–250+')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'previous'}).hasAttribute('disabled')).toBe(
      true,
    );

    const next = screen.getByRole('button', {name: 'next'});
    await userEvent.click(next);

    const pagination = screen.getByRole('navigation', {name: 'Project pages'});
    expect(within(pagination).getByRole('status').textContent).toBe('loading page…');
    expect(screen.getByRole('heading', {name: 'Project 1'})).toBeTruthy();
    expect(document.activeElement).toBe(next);

    resolveSecondPage(
      json({
        projects: [{...projectFixture, id: 'project-251', name: 'Project 251'}],
        nextCursor: null,
      }),
    );

    expect(await screen.findByRole('heading', {name: 'Project 251'})).toBeTruthy();
    expect(within(pagination).getByRole('status').textContent).toBe('showing 251–251');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', {name: 'project list'}),
      ),
    );
    expect(screen.queryByRole('heading', {name: 'Project 1'})).toBeNull();
    expect(screen.getByRole('button', {name: 'next'}).hasAttribute('disabled')).toBe(
      true,
    );

    await userEvent.click(screen.getByRole('button', {name: 'previous'}));

    expect(await screen.findByRole('heading', {name: 'Project 1'})).toBeTruthy();
    expect(within(pagination).getByRole('status').textContent).toBe('showing 1–250+');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', {name: 'project list'}),
      ),
    );
    expect(screen.getByRole('button', {name: 'previous'}).hasAttribute('disabled')).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/projects\?(?=.*year=2026)(?=.*limit=250)(?!.*cursor=)/,
      ),
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/projects\?(?=.*year=2026)(?=.*limit=250)(?=.*cursor=250)/,
      ),
      undefined,
    );
  });

  it('preserves filter focus when it supersedes a pending page fetch', async () => {
    let resolveSecondPage!: (response: Response) => void;
    let resolveIdeas!: (response: Response) => void;
    const pendingSecondPage = new Promise<Response>((resolve) => {
      resolveSecondPage = resolve;
    });
    const pendingIdeas = new Promise<Response>((resolve) => {
      resolveIdeas = resolve;
    });
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 251,
            ideaCount: 1,
            groupCount: 0,
            participantCount: 252,
          },
          groups: [],
          awards: [],
          myProjects: [],
        });
      }

      const requestUrl = new URL(url, 'https://hackweek.test');
      if (requestUrl.searchParams.get('kind') === 'idea') return pendingIdeas;
      if (requestUrl.searchParams.get('cursor') === '250') return pendingSecondPage;
      return json({projects: [projectFixture], nextCursor: '250'});
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    await userEvent.click(screen.getByRole('button', {name: 'next'}));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('cursor=250'),
        undefined,
      ),
    );

    const ideas = screen.getByRole('button', {name: /Ideas/});
    await userEvent.click(ideas);
    expect(document.activeElement).toBe(ideas);

    resolveIdeas(
      json({
        projects: [
          {
            ...projectFixture,
            id: 'idea',
            name: 'Open signal',
            kind: 'idea',
            group: null,
            members: [],
          },
        ],
        nextCursor: null,
      }),
    );

    expect(await screen.findByRole('heading', {name: 'Open signal'})).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(ideas));

    resolveSecondPage(
      json({
        projects: [{...projectFixture, id: 'project-251', name: 'Project 251'}],
        nextCursor: null,
      }),
    );
  });

  it('keeps search focus when typing supersedes a pending page fetch', async () => {
    let resolveSecondPage!: (response: Response) => void;
    const pendingSecondPage = new Promise<Response>((resolve) => {
      resolveSecondPage = resolve;
    });
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 251,
            ideaCount: 0,
            groupCount: 0,
            participantCount: 251,
          },
          groups: [],
          awards: [],
          myProjects: [],
        });
      }

      const requestUrl = new URL(url, 'https://hackweek.test');
      if (requestUrl.searchParams.get('cursor') === '250') return pendingSecondPage;
      return json({projects: [projectFixture], nextCursor: '250'});
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    await userEvent.click(screen.getByRole('button', {name: 'next'}));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('cursor=250'),
        undefined,
      ),
    );

    const searchInput = screen.getByRole('searchbox', {
      name: 'Search projects and ideas',
    });
    await userEvent.type(searchInput, 's');
    expect(document.activeElement).toBe(searchInput);

    resolveSecondPage(
      json({
        projects: [{...projectFixture, id: 'project-251', name: 'Project 251'}],
        nextCursor: null,
      }),
    );

    expect(await screen.findByRole('heading', {name: 'Project 251'})).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(searchInput));
  });

  it('keeps Previous available and announces an empty later page', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 1,
            ideaCount: 0,
            groupCount: 0,
            participantCount: 1,
          },
          groups: [],
          awards: [],
          myProjects: [],
        });
      }

      const cursor = new URL(url, 'https://hackweek.test').searchParams.get('cursor');
      if (cursor === '250') return json({projects: [], nextCursor: null});
      return json({projects: [projectFixture], nextCursor: '250'});
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    await userEvent.click(screen.getByRole('button', {name: 'next'}));

    expect(await screen.findByRole('heading', {name: 'No projects found'})).toBeTruthy();
    const emptyResults = screen.getByRole('region', {name: 'project results'});
    const pagination = screen.getByRole('navigation', {name: 'Project pages'});
    expect(within(pagination).getByRole('status').textContent).toBe(
      'no projects found on this page',
    );
    const previous = within(pagination).getByRole('button', {name: 'previous'});
    expect(previous.hasAttribute('disabled')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(emptyResults));

    await userEvent.click(previous);

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', {name: 'project list'}),
      ),
    );
    expect(screen.getByRole('button', {name: 'previous'}).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('live-updates server search without replacing the current list', async () => {
    let resolveSearch!: (response: Response) => void;
    const pendingSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve;
    });
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/years/2026')) {
        return json({
          year: {
            id: '2026',
            votingEnabled: false,
            submissionsClosed: false,
            projectCount: 1,
            ideaCount: 0,
            groupCount: 1,
            participantCount: 1,
          },
          groups: [{id: 'group', yearId: '2026', name: 'Orbital', projectCount: 1}],
          awards: [],
          myProjects: [],
          streamMode: 'disabled',
        });
      }
      if (url.includes('q=useful+experiment')) return pendingSearch;
      return json({projects: [projectFixture], nextCursor: null});
    });

    renderRoute(<ProjectsPage />, '/years/2026/projects', '/years/:yearId/projects');
    await screen.findByRole('heading', {name: 'A small machine'});

    const search = screen.getByRole('search', {name: 'Search projects and ideas'});
    const input = within(search).getByLabelText('Search projects and ideas');
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('maxlength')).toBe('100');

    await userEvent.selectOptions(screen.getByLabelText('Group'), 'group');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('group=group'),
        undefined,
      ),
    );
    await userEvent.click(screen.getByRole('button', {name: 'list view'}));
    const activeSearch = screen.getByRole('search', {
      name: 'Search projects and ideas',
    });
    await userEvent.type(
      within(activeSearch).getByLabelText('Search projects and ideas'),
      'useful experiment',
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/projects\?(?=.*year=2026)(?=.*kind=project)(?=.*group=group)(?=.*q=useful\+experiment)/,
        ),
        undefined,
      ),
    );
    expect(screen.getByRole('region', {name: 'project list'}).className).toBe(
      'projectList',
    );
    expect(screen.getByRole('heading', {name: 'A small machine'})).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('updating…');

    resolveSearch(
      json({
        projects: [{...projectFixture, id: 'search-match', name: 'Useful experiment'}],
        nextCursor: null,
        projectCount: 1,
        ideaCount: 2,
      }),
    );
    expect(await screen.findByRole('heading', {name: 'Useful experiment'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Projects 1'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Ideas 2'})).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    await userEvent.click(
      within(screen.getByRole('search', {name: 'Search projects and ideas'})).getByRole(
        'button',
        {name: 'clear'},
      ),
    );
    await waitFor(() => {
      const lastInput = fetchMock.mock.calls.at(-1)?.[0];
      const lastUrl =
        lastInput instanceof Request ? lastInput.url : lastInput?.toString();
      expect(lastUrl).not.toContain('q=');
    });
  });

  it('adds every open award category before project media and video', async () => {
    mockProjectDetails({
      detail: {
        ...projectFixture,
        permissions: {...projectFixture.permissions, canVote: true},
      },
      ballot: {
        year: {id: '2026', votingEnabled: true},
        categories: [
          {id: 'delight', yearId: '2026', name: 'Delight'},
          {id: 'impact', yearId: '2026', name: 'Impact'},
          {id: 'craft', yearId: '2026', name: 'Craft'},
        ],
        votes: [],
      },
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const voting = await screen.findByRole('region', {name: 'vote for this project'});
    expect(within(voting).getByRole('heading', {name: 'Delight'})).toBeTruthy();
    expect(within(voting).getByRole('heading', {name: 'Impact'})).toBeTruthy();
    expect(within(voting).getByRole('heading', {name: 'Craft'})).toBeTruthy();
    expect(within(voting).getAllByRole('listitem')).toHaveLength(3);

    const video = screen.getByRole('region', {name: 'project video'});
    expect(
      voting.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('heading', {name: 'attachments'})).toBeTruthy();
  });

  it('keeps restricted award rows visible and unavailable on project details', async () => {
    mockProjectDetails({
      detail: {
        ...projectFixture,
        nominationCategoryIds: ['delight'],
        permissions: {...projectFixture.permissions, canVote: true},
      },
      ballot: {
        year: {id: '2026', votingEnabled: true},
        categories: [
          {id: 'delight', yearId: '2026', name: 'Delight'},
          {id: 'impact', yearId: '2026', name: 'Impact'},
          {id: 'craft', yearId: '2026', name: 'Craft'},
        ],
        votes: [],
      },
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const voting = await screen.findByRole('region', {name: 'vote for this project'});
    expect(within(voting).getAllByRole('listitem')).toHaveLength(3);
    expect(within(voting).getByRole('button', {name: 'vote for Delight'})).toBeTruthy();
    expect(within(voting).getAllByText('not entered for this project')).toHaveLength(2);
    expect(within(voting).getAllByRole('button')).toHaveLength(1);
  });

  it('uses the loaded project year for ballot state', async () => {
    mockProjectDetails({
      detail: {
        ...projectFixture,
        permissions: {...projectFixture.permissions, canVote: true},
      },
      ballot: {
        year: {id: '2026', votingEnabled: true},
        categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
        votes: [],
      },
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2025/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    expect(
      await screen.findByRole('region', {name: 'vote for this project'}),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/votes?year=2026', undefined);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/votes?year=2025', undefined);
  });

  it('shows local ballot loading and retry states on project details', async () => {
    let resolveBallot!: (response: Response) => void;
    const pendingBallot = new Promise<Response>((resolve) => {
      resolveBallot = resolve;
    });
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes('/api/votes?')) return pendingBallot;
      if (url.endsWith('/video')) return json({video: null});
      return json({
        project: {
          ...projectFixture,
          permissions: {...projectFixture.permissions, canVote: true},
        },
      });
    });

    const loading = renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    expect(
      await screen.findByRole('region', {name: 'loading voting status…'}),
    ).toBeTruthy();
    resolveBallot(
      json({
        year: {id: '2026', votingEnabled: false},
        categories: [],
        votes: [],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('region', {name: 'loading voting status…'})).toBeNull(),
    );
    loading.unmount();

    fetchMock.mockReset();
    let ballotReads = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes('/api/votes?')) {
        ballotReads += 1;
        if (ballotReads === 1) {
          return json(
            {error: {code: 'BALLOT_UNAVAILABLE', message: 'Ballot unavailable'}},
            503,
          );
        }
        return json({
          year: {id: '2026', votingEnabled: true},
          categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
          votes: [],
        });
      }
      if (url.endsWith('/video')) return json({video: null});
      return json({
        project: {
          ...projectFixture,
          permissions: {...projectFixture.permissions, canVote: true},
        },
      });
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const error = await screen.findByRole('region', {
      name: 'voting status unavailable',
    });
    expect(within(error).getByRole('alert').textContent).toContain('Ballot unavailable');
    await userEvent.click(within(error).getByRole('button', {name: 'try again'}));
    expect(
      await screen.findByRole('region', {name: 'vote for this project'}),
    ).toBeTruthy();
    expect(ballotReads).toBe(2);
  });

  it('replaces stale voting controls when a ballot refresh fails', async () => {
    let ballotReads = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url.includes('/api/votes?')) {
        ballotReads += 1;
        if (ballotReads === 1) {
          return json({
            year: {id: '2026', votingEnabled: true},
            categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
            votes: [],
          });
        }
        return json(
          {error: {code: 'BALLOT_UNAVAILABLE', message: 'Ballot unavailable'}},
          503,
        );
      }
      if (url === '/api/votes' && init?.method === 'POST') {
        return json(
          {
            vote: {
              id: 'vote-delight',
              yearId: '2026',
              projectId: 'project',
              categoryId: 'delight',
            },
          },
          201,
        );
      }
      if (url.endsWith('/video')) return json({video: null});
      return json({
        project: {
          ...projectFixture,
          permissions: {...projectFixture.permissions, canVote: true},
        },
      });
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const voting = await screen.findByRole('region', {name: 'vote for this project'});
    await userEvent.click(within(voting).getByRole('button', {name: 'vote for Delight'}));

    expect(
      await screen.findByRole('region', {name: 'voting status unavailable'}),
    ).toBeTruthy();
    expect(screen.queryByRole('region', {name: 'vote for this project'})).toBeNull();
    expect(ballotReads).toBe(2);
  });

  it('explains unavailable own-project voting and hides controls when closed', async () => {
    mockProjectDetails({
      detail: projectFixture,
      ballot: {
        year: {id: '2026', votingEnabled: true},
        categories: [
          {id: 'delight', yearId: '2026', name: 'Delight'},
          {id: 'impact', yearId: '2026', name: 'Impact'},
        ],
        votes: [],
      },
    });

    const ownProject = renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const voting = await screen.findByRole('region', {name: 'vote for this project'});
    expect(within(voting).getByText('your project sits this one out')).toBeTruthy();
    expect(within(voting).getAllByText('unavailable on your own project')).toHaveLength(
      2,
    );
    expect(within(voting).queryByRole('button')).toBeNull();
    ownProject.unmount();

    fetchMock.mockReset();
    mockProjectDetails({
      detail: {
        ...projectFixture,
        permissions: {...projectFixture.permissions, canVote: true},
      },
      ballot: {
        year: {id: '2026', votingEnabled: false},
        categories: [{id: 'delight', yearId: '2026', name: 'Delight'}],
        votes: [],
      },
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/api/votes?')),
      ).toBe(true),
    );
    expect(screen.queryByRole('region', {name: 'vote for this project'})).toBeNull();
  });

  it('renders compact Markdown in project cards without exposing block layout', () => {
    const summary =
      '# Overview\nFirst line\nSecond line with **detail** and a [link](https://example.com).';

    renderRoute(<ProjectCard project={{...projectFixture, summary}} />, '/');

    const card = screen
      .getByRole('heading', {name: 'A small machine'})
      .closest('.projectCard');
    expect(card).toBeTruthy();
    const projectLink = screen.getByRole('link', {name: 'A small machine'});
    const markdownLink = screen.getByRole('link', {name: 'link'});
    expect(projectLink.getAttribute('href')).toBe('/years/2026/projects/project');
    expect(markdownLink.getAttribute('href')).toBe('https://example.com');
    expect(markdownLink.closest('.projectCard')).toBe(card);
    expect(projectLink.contains(markdownLink)).toBe(false);
    const description = markdownLink.closest('.markdown');
    expect(description?.classList.contains('markdown--compact')).toBe(true);
    expect(description?.getAttribute('title')).toBe(summary);
    expect(screen.getByText('detail').tagName).toBe('STRONG');
    expect(screen.queryByRole('heading', {name: 'Overview'})).toBeNull();
  });

  it('renders project descriptions as GitHub-flavored Markdown', async () => {
    mockProjectDetails({
      detail: {
        ...projectFixture,
        summary:
          'Built with **care**. Visit https://example.com/docs.\nSecond line with [details](#details).\n\nUse <Widget> safely.\n\n- [x] Links work',
      },
    });

    const rendered = renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    expect((await screen.findByText('care')).tagName).toBe('STRONG');
    const link = screen.getByRole('link', {name: 'https://example.com/docs'});
    expect(link.getAttribute('href')).toBe('https://example.com/docs');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(screen.getByRole('link', {name: 'details'}).getAttribute('target')).toBeNull();
    expect(rendered.container.querySelector('.markdown br')).toBeTruthy();
    expect(screen.getByText('Use <Widget> safely.')).toBeTruthy();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    if (!(checkbox instanceof HTMLInputElement)) throw new Error();
    expect(checkbox.checked).toBe(true);
  });

  it('sanitizes unsafe Markdown URLs and raw HTML', async () => {
    mockProjectDetails({
      detail: {
        ...projectFixture,
        summary: '[unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>',
      },
    });

    const rendered = renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const link = (await screen.findByText('unsafe')).closest('a');
    expect(link?.getAttribute('href')).toBe('');
    expect(rendered.container.querySelector('.markdown img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('previews image attachments and opens the original in a new tab', async () => {
    mockProjectDetails({
      detail: {
        ...projectFixture,
        media: [
          {
            id: 'screenshot',
            originalName: 'Launch screenshot.PNG',
            mediaType: 'IMAGE/PNG',
            sizeBytes: 2048,
            status: 'available',
            createdAt: '2026-01-02',
          },
          {
            id: 'notes',
            originalName: 'Notes.txt',
            mediaType: 'text/plain',
            sizeBytes: 9,
            status: 'available',
            createdAt: '2026-01-03',
          },
        ],
      },
    });

    const rendered = renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/project',
      '/years/:yearId/projects/:projectId',
    );

    const imageLink = await screen.findByRole('link', {
      name: 'Open Launch screenshot.PNG full size',
    });
    expect(imageLink.getAttribute('href')).toBe(
      '/api/media/screenshot/content?preview=1',
    );
    expect(imageLink.getAttribute('target')).toBe('_blank');
    expect(imageLink.getAttribute('rel')).toBe('noreferrer');
    expect(imageLink.querySelector('img')?.getAttribute('src')).toBe(
      '/api/media/screenshot/content?preview=1',
    );
    expect(rendered.container.querySelectorAll('.mediaPreview')).toHaveLength(1);

    const notesLink = screen.getByRole('link', {name: /Notes\.txt/});
    expect(notesLink.getAttribute('href')).toBe('/api/media/notes/content');
    expect(notesLink.getAttribute('target')).toBeNull();
  });

  it('renders an idea with no video and exposes the server claim permission', async () => {
    mockProjectDetails({
      detail: {
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
          canVote: false,
        },
      },
    });

    renderRoute(
      <ProjectDetailsPage />,
      '/years/2026/projects/idea',
      '/years/:yearId/projects/:projectId',
    );

    expect(await screen.findByRole('heading', {name: 'A small machine'})).toBeTruthy();
    expect(
      screen.getByRole('link', {name: 'Claim this idea'}).getAttribute('href'),
    ).toContain('?claim');
    expect(screen.queryByRole('region', {name: 'vote for this project'})).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/api/votes?')),
    ).toBe(false);
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
        canVote: false,
      },
    };
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/media/projects/project' && init?.method === 'POST')
        return json({media: {id: 'media', originalName: 'proof.txt'}}, 201);
      if (url.includes('/api/votes?'))
        return json({
          year: {id: '2026', votingEnabled: false},
          categories: [],
          votes: [],
        });
      if (url.endsWith('/video')) return json({video: null});
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

function json<T>(value: T, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

function requestUrl(input: string | URL | Request) {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : input;
}

function mockProjectDetails({
  detail,
  ballot = {
    year: {id: detail.yearId, votingEnabled: false},
    categories: [],
    votes: [],
  },
}: {
  detail: ProjectDetail;
  ballot?: BallotStatusResponse;
}) {
  fetchMock.mockImplementation(async (input) => {
    const url = requestUrl(input);
    if (url.includes('/api/votes?')) return json(ballot);
    if (url.endsWith('/video')) return json({video: null});
    return json({project: detail});
  });
}

function mockProjectsOverview({
  votingEnabled = true,
  categories = [],
  votes = [],
  projects = [],
  myProjects = [],
  ballotError = false,
}: {
  votingEnabled?: boolean;
  categories?: Array<{id: string; yearId: string; name: string}>;
  votes?: BallotStatusResponse['votes'];
  projects?: ProjectDetail[];
  myProjects?: ProjectDetail[];
  ballotError?: boolean;
}) {
  fetchMock.mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes('/api/years/2026')) {
      return json({
        year: {
          id: '2026',
          votingEnabled,
          submissionsClosed: false,
          isCurrent: true,
          projectCount: projects.length,
          ideaCount: 0,
          groupCount: 0,
          participantCount: 0,
        },
        groups: [],
        awards: [],
        myProjects,
      });
    }
    if (url.includes('/api/votes?')) {
      if (ballotError) {
        return json(
          {error: {code: 'BALLOT_UNAVAILABLE', message: 'Ballot unavailable'}},
          503,
        );
      }
      return json({year: {id: '2026', votingEnabled}, categories, votes});
    }
    return json({projects, nextCursor: null});
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
  nominationCategoryIds: [],
  permissions: {
    canEdit: true,
    canDelete: true,
    canClaim: false,
    canManageMedia: true,
    canVote: false,
  },
};
