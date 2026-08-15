import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import app from '../../src/worker';
import {
  LOCAL_SESSION_COOKIE_NAME,
  readAuthConfig,
  SESSION_COOKIE_NAME,
  type AuthBindings,
} from '../../src/worker/middleware/auth';
import {sha256Hex} from '../../src/worker/services/sessions';
import {
  authenticatedHeaders,
  cookieToken,
  createSessionCookie,
  googleAuthBindings,
  signGoogleIdToken,
} from './fixture';

const endpoint = 'https://hackweek.test/api/session';
const tokenFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', tokenFetch);

beforeEach(async () => {
  tokenFetch.mockReset();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_sessions'),
    env.DB.prepare('DELETE FROM oauth_login_attempts'),
    env.DB.prepare('DELETE FROM users'),
  ]);
});

describe('Google OAuth authorization code flow', () => {
  it('creates a short-lived state/nonce/PKCE attempt and an exact Google URL', async () => {
    const response = await SELF.fetch('https://hackweek.test/api/auth/login', {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    const url = new URL(response.headers.get('Location')!);
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: googleAuthBindings.GOOGLE_CLIENT_ID,
      redirect_uri: 'https://hackweek.test/api/auth/callback',
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
    });
    expect(url.searchParams.get('state')).toHaveLength(43);
    expect(url.searchParams.get('nonce')).toHaveLength(43);
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(url.searchParams.has('returnTo')).toBe(false);

    const row = await env.DB.prepare(
      `SELECT state_hash, nonce, code_verifier, expires_at - created_at AS ttl
       FROM oauth_login_attempts`,
    ).first<{
      state_hash: string;
      nonce: string;
      code_verifier: string;
      ttl: number;
    }>();
    expect(row).toMatchObject({nonce: url.searchParams.get('nonce'), ttl: 600});
    expect(row?.state_hash).toBe(await sha256Hex(url.searchParams.get('state')!));
    expect(row?.code_verifier).toHaveLength(86);
  });

  it('exchanges the code server-side, verifies the ID token, and stores only a hashed session', async () => {
    const login = await SELF.fetch('https://hackweek.test/api/auth/login', {
      redirect: 'manual',
    });
    const authorization = new URL(login.headers.get('Location')!);
    const state = authorization.searchParams.get('state')!;
    const nonce = authorization.searchParams.get('nonce')!;
    const idToken = await signGoogleIdToken({nonce});
    tokenFetch.mockImplementation(async (_input, init) => {
      expect(init?.body).toBeInstanceOf(URLSearchParams);
      if (!(init?.body instanceof URLSearchParams)) throw new Error();
      const body = init.body;
      expect(body.get('code')).toBe('one-time-code');
      expect(body.get('client_secret')).toBe(googleAuthBindings.GOOGLE_CLIENT_SECRET);
      expect(body.get('code_verifier')).toHaveLength(86);
      expect(body.get('grant_type')).toBe('authorization_code');
      return Response.json({id_token: idToken, access_token: 'discarded'});
    });

    const callback = await SELF.fetch(
      `https://hackweek.test/api/auth/callback?code=one-time-code&state=${state}`,
      {redirect: 'manual'},
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get('Location')).toBe('/');
    const setCookie = callback.headers.get('Set-Cookie')!;
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    const rawToken = cookieToken(setCookie).split('=')[1];
    expect(rawToken).toHaveLength(43);
    const stored = await env.DB.prepare(
      `SELECT token_hash, user_id, expires_at - created_at AS ttl, revoked_at
       FROM user_sessions`,
    ).first<{
      token_hash: string;
      user_id: string;
      ttl: number;
      revoked_at: number | null;
    }>();
    expect(stored).toMatchObject({token_hash: await sha256Hex(rawToken), ttl: 28800});
    expect(stored?.token_hash).not.toBe(rawToken);
    expect(
      await env.DB.prepare('SELECT google_subject, is_admin FROM users').first(),
    ).toEqual({
      google_subject: 'google-member',
      is_admin: 0,
    });

    const session = await SELF.fetch(endpoint, {
      headers: {Cookie: cookieToken(setCookie)},
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: {email: 'member@sentry.io', role: 'member'},
    });
  });

  it('consumes state once even when exchange fails and rejects replay', async () => {
    const login = await SELF.fetch('https://hackweek.test/api/auth/login', {
      redirect: 'manual',
    });
    const state = new URL(login.headers.get('Location')!).searchParams.get('state')!;
    tokenFetch.mockResolvedValue(Response.json({error: 'invalid_grant'}, {status: 400}));

    const first = await callback(state);
    const replay = await callback(state);

    expect(first.headers.get('Location')).toBe('/?auth_error=failed');
    expect(replay.headers.get('Location')).toBe('/?auth_error=failed');
    expect(tokenFetch).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM oauth_login_attempts').first(),
    ).toEqual({count: 0});
  });

  it('rejects expired state before token exchange', async () => {
    await env.DB.prepare(
      `INSERT INTO oauth_login_attempts
        (state_hash, nonce, code_verifier, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(await sha256Hex('expired-state'), 'n'.repeat(43), 'v'.repeat(43), 2, 1)
      .run();

    const response = await callback('expired-state');

    expect(response.headers.get('Location')).toBe('/?auth_error=failed');
    expect(tokenFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong issuer', {iss: 'https://attacker.example'}],
    ['wrong audience', {aud: 'other-client'}],
    ['expired token', {exp: Math.floor(Date.now() / 1000) - 1}],
    ['wrong nonce', {nonce: 'other-nonce'}],
    ['unverified email', {email_verified: false}],
    ['wrong domain', {email: 'member@sentry.io.attacker.example'}],
  ])('rejects %s ID tokens', async (_name, overrides) => {
    const {state, nonce} = await beginLogin();
    tokenFetch.mockImplementation(async () =>
      Response.json({id_token: await signGoogleIdToken({nonce, ...overrides})}),
    );

    const response = await callback(state);

    expect(response.headers.get('Location')).toMatch(
      /^\/?\?auth_error=(failed|forbidden)$/,
    );
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM user_sessions').first(),
    ).toEqual({
      count: 0,
    });
  });

  it('rejects refresh tokens rather than persisting them', async () => {
    const {state, nonce} = await beginLogin();
    tokenFetch.mockImplementation(async () =>
      Response.json({
        id_token: await signGoogleIdToken({nonce}),
        refresh_token: 'must-not-be-accepted',
      }),
    );

    await callback(state);

    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM user_sessions').first(),
    ).toEqual({
      count: 0,
    });
  });

  it('rotates existing sessions on login while preserving D1 admin authority', async () => {
    const oldCookie = await createSessionCookie();
    await env.DB.prepare(
      "UPDATE users SET is_admin = 1 WHERE google_subject = 'google-member'",
    ).run();
    const {state, nonce} = await beginLogin();
    tokenFetch.mockImplementation(async () =>
      Response.json({id_token: await signGoogleIdToken({nonce, is_admin: true})}),
    );

    const loggedIn = await callback(state);
    const newCookie = cookieToken(loggedIn.headers.get('Set-Cookie')!);

    expect((await SELF.fetch(endpoint, {headers: {Cookie: oldCookie}})).status).toBe(401);
    const session = await SELF.fetch(endpoint, {headers: {Cookie: newCookie}});
    expect(await session.json()).toMatchObject({user: {role: 'admin'}});
  });
});

describe('session and request security', () => {
  it('lets an admin enter member mode and return using their underlying role', async () => {
    const cookie = await createSessionCookie({
      sub: 'google-admin',
      email: 'admin@sentry.io',
      name: 'Hackweek Admin',
    });
    await env.DB.prepare(
      "UPDATE users SET is_admin = 1 WHERE google_subject = 'google-admin'",
    ).run();

    const initial = await SELF.fetch(endpoint, {headers: {Cookie: cookie}});
    expect(await initial.json()).toMatchObject({
      user: {role: 'admin', actualRole: 'admin'},
    });

    const invalid = await changeViewMode(cookie, 'owner');
    expect(invalid.status).toBe(400);

    const memberMode = await changeViewMode(cookie, 'member');
    expect(memberMode.status).toBe(200);
    expect(await memberMode.json()).toMatchObject({
      user: {role: 'member', actualRole: 'admin'},
    });
    expect(
      (
        await env.DB.prepare(
          `SELECT view_as_member FROM user_sessions
           JOIN users ON users.id = user_sessions.user_id
           WHERE users.google_subject = 'google-admin'`,
        ).first()
      )?.view_as_member,
    ).toBe(1);
    expect(
      (
        await SELF.fetch('https://hackweek.test/api/admin/session', {
          headers: {Cookie: cookie},
        })
      ).status,
    ).toBe(403);

    const adminMode = await changeViewMode(cookie, 'admin');
    expect(adminMode.status).toBe(200);
    expect(await adminMode.json()).toMatchObject({
      user: {role: 'admin', actualRole: 'admin'},
    });
    expect(
      (
        await SELF.fetch('https://hackweek.test/api/admin/session', {
          headers: {Cookie: cookie},
        })
      ).status,
    ).toBe(200);
  });

  it('forbids members from changing either session view mode', async () => {
    const cookie = await createSessionCookie();

    for (const mode of ['member', 'admin']) {
      const response = await changeViewMode(cookie, mode);
      expect(response.status).toBe(403);
    }

    const stored = await env.DB.prepare(
      `SELECT view_as_member FROM user_sessions
       JOIN users ON users.id = user_sessions.user_id
       WHERE users.google_subject = 'google-member'`,
    ).first();
    expect(stored).toEqual({view_as_member: 0});
    const session = await SELF.fetch(endpoint, {headers: {Cookie: cookie}});
    expect(await session.json()).toMatchObject({
      user: {role: 'member', actualRole: 'member'},
    });
  });

  it('revokes logout, clears the cookie, and requires exact same origin', async () => {
    const cookie = await createSessionCookie();
    const crossOrigin = await SELF.fetch('https://hackweek.test/api/auth/logout', {
      method: 'POST',
      headers: {Cookie: cookie, Origin: 'https://evil.example'},
    });
    expect(crossOrigin.status).toBe(403);

    const logout = await SELF.fetch('https://hackweek.test/api/auth/logout', {
      method: 'POST',
      headers: {Cookie: cookie, Origin: 'https://hackweek.test'},
      redirect: 'manual',
    });
    expect(logout.status).toBe(303);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await SELF.fetch(endpoint, {headers: {Cookie: cookie}})).status).toBe(401);
  });

  it('rejects authenticated mutations without an exact Origin', async () => {
    const cookie = await createSessionCookie();
    const payload = JSON.stringify({displayName: 'New Name', avatarUrl: null});
    for (const origin of [
      undefined,
      'https://evil.example',
      'https://hackweek.test.evil',
    ]) {
      const headers = new Headers({Cookie: cookie, 'Content-Type': 'application/json'});
      if (origin) headers.set('Origin', origin);
      const response = await SELF.fetch(`${endpoint}/profile`, {
        method: 'PUT',
        headers,
        body: payload,
      });
      expect(response.status).toBe(403);
    }
  });

  it('rejects expired and forged opaque sessions', async () => {
    const cookie = await createSessionCookie();
    await env.DB.prepare(
      'UPDATE user_sessions SET created_at = 1, last_used_at = 1, expires_at = 2',
    ).run();
    expect((await SELF.fetch(endpoint, {headers: {Cookie: cookie}})).status).toBe(401);
    expect(
      (
        await SELF.fetch(endpoint, {
          headers: {Cookie: `${SESSION_COOKIE_NAME}=${'x'.repeat(43)}`},
        })
      ).status,
    ).toBe(401);
  });

  it('rejects forged identity headers without a session', async () => {
    const response = await SELF.fetch(endpoint, {
      headers: {
        'Cf-Access-Authenticated-User-Email': 'admin@sentry.io',
        'Cf-Access-Jwt-Assertion': 'forged',
        'X-Goog-Authenticated-User-Email': 'accounts.google.com:admin@sentry.io',
        'X-Goog-Authenticated-User-Id': 'accounts.google.com:attacker',
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {code: 'AUTH_REQUIRED', message: 'Sign in is required'},
    });
  });
});

describe('Google OAuth configuration', () => {
  it.each<[string, Partial<AuthBindings>]>([
    ['APP_ORIGIN is missing', {APP_ORIGIN: undefined}],
    ['GOOGLE_CLIENT_ID is missing', {GOOGLE_CLIENT_ID: undefined}],
    ['GOOGLE_CLIENT_SECRET is missing', {GOOGLE_CLIENT_SECRET: undefined}],
    ['GOOGLE_REDIRECT_URI is missing', {GOOGLE_REDIRECT_URI: undefined}],
    [
      'GOOGLE_REDIRECT_URI does not match APP_ORIGIN',
      {GOOGLE_REDIRECT_URI: 'https://hackweek.test/wrong'},
    ],
    ['ALLOWED_EMAIL_DOMAIN is missing', {ALLOWED_EMAIL_DOMAIN: undefined}],
  ])('fails closed when %s', async (_name, overrides) => {
    const response = await fetchWithAuthBindings(overrides);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {code: 'AUTH_CONFIG_INVALID'},
    });
  });

  it('supports Google OAuth on an exact loopback origin', () => {
    const config = readAuthConfig({
      ...googleAuthBindings,
      APP_ORIGIN: 'http://localhost:5173',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/callback',
    });
    expect(config.secureCookie).toBe(false);
    expect(LOCAL_SESSION_COOKIE_NAME).not.toMatch(/^__Host-/);
  });
});

async function beginLogin() {
  const login = await SELF.fetch('https://hackweek.test/api/auth/login', {
    redirect: 'manual',
  });
  const url = new URL(login.headers.get('Location')!);
  return {state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')!};
}

function changeViewMode(cookie: string, mode: string) {
  const headers = authenticatedHeaders(cookie, true);
  headers.set('Content-Type', 'application/json');
  return SELF.fetch(`${endpoint}/view-mode`, {
    method: 'POST',
    headers,
    body: JSON.stringify({mode}),
  });
}

function callback(state: string) {
  return SELF.fetch(
    `https://hackweek.test/api/auth/callback?code=one-time-code&state=${encodeURIComponent(state)}`,
    {redirect: 'manual'},
  );
}

function fetchWithAuthBindings(overrides: Partial<AuthBindings>) {
  return app.request(
    endpoint,
    {},
    {
      DB: env.DB,
      ATTACHMENTS: env.ATTACHMENTS,
      ...googleAuthBindings,
      ...overrides,
    },
  );
}
