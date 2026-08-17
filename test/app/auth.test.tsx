import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {App} from '../../src/app/App';
import {SessionProvider} from '../../src/app/session';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('Google sign-in experience', () => {
  it('shows the legacy-styled Sign in with Google action when unauthenticated', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {error: {code: 'AUTH_REQUIRED', message: 'Sign in is required'}},
        {status: 401},
      ),
    );

    render(
      <SessionProvider>
        <App />
      </SessionProvider>,
    );

    expect(
      await screen.findByRole('heading', {name: 'Welcome to Hackweek'}),
    ).toBeTruthy();
    const loginLink = screen.getByRole('link', {name: 'Sign in with Google'});
    expect(loginLink.getAttribute('href')).toBe('/api/auth/login');
    expect(loginLink.querySelector('svg')).toBeTruthy();
  });

  it('returns to sign-in instead of showing a query error when a session expires', async () => {
    window.history.replaceState(null, '', '/years');
    fetchMock.mockImplementation(async (input) => {
      const path =
        input instanceof Request ? new URL(input.url).pathname : input.toString();
      if (path === '/api/session') {
        return Response.json({
          user: {
            id: 'member',
            email: 'member@sentry.io',
            displayName: 'Member One',
            avatarUrl: null,
            role: 'member',
            actualRole: 'member',
          },
        });
      }
      return Response.json(
        {error: {code: 'AUTH_REQUIRED', message: 'Sign in is required'}},
        {status: 401},
      );
    });
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}},
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', {name: 'Welcome to Hackweek'}),
    ).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', {name: 'Something went wrong'})).toBeNull();
    expect(screen.getByRole('link', {name: 'Sign in with Google'})).toBeTruthy();
  });

  it('explains a failed fixed callback without reflecting arbitrary text', async () => {
    window.history.replaceState(null, '', '/?auth_error=failed&message=attacker');
    fetchMock.mockResolvedValue(
      Response.json(
        {error: {code: 'AUTH_REQUIRED', message: 'Sign in is required'}},
        {status: 401},
      ),
    );

    render(
      <SessionProvider>
        <App />
      </SessionProvider>,
    );

    expect(
      await screen.findByText('Your sign-in could not be completed. Please start again.'),
    ).toBeTruthy();
    expect(screen.queryByText('attacker')).toBeNull();
  });
});
