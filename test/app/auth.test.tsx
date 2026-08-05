import {render, screen} from '@testing-library/react';
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
    expect(
      screen.getByRole('link', {name: 'Sign in with Google'}).getAttribute('href'),
    ).toBe('/api/auth/login');
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
