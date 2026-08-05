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
  cookieToken,
  createSessionCookie,
  googleAuthBindings,
  localBrowserAuthBindings,
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
      const body = init?.body as URLSearchParams;
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
});

describe('loopback local authentication', () => {
  it.each([
    'http://localhost:5173/api/session',
    'http://127.0.0.1:5173/api/session',
    'http://[::1]:5173/api/session',
  ])('creates a D1 member when APP_ORIGIN exactly matches %s', async (url) => {
    const origin = new URL(url).origin;
    const response = await fetchLocal(url, {APP_ORIGIN: origin});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: {email: 'developer@sentry.io', role: 'member'},
    });
  });

  it.each(['https://hackweek.test', 'http://192.168.1.20:5173', 'http://127.0.0.2:5173'])(
    'fails closed for non-loopback APP_ORIGIN %s',
    async (APP_ORIGIN) => {
      expect(() => readAuthConfig({...localBrowserAuthBindings, APP_ORIGIN})).toThrow();
    },
  );

  it('uses a non-Secure local cookie only for loopback Google OAuth', () => {
    const config = readAuthConfig({
      ...googleAuthBindings,
      APP_ORIGIN: 'http://localhost:5173',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/callback',
    });
    expect(config.secureCookie).toBe(false);
    expect(LOCAL_SESSION_COOKIE_NAME).not.toMatch(/^__Host-/);
  });

  it('rejects Google configuration and role input in local mode', async () => {
    const response = await fetchLocal('http://localhost:5173/api/session?role=admin', {
      GOOGLE_CLIENT_ID: 'attacker-client',
      LOCAL_AUTH_IS_ADMIN: 'true',
    });
    expect(response.status).toBe(500);
  });
});

async function beginLogin() {
  const login = await SELF.fetch('https://hackweek.test/api/auth/login', {
    redirect: 'manual',
  });
  const url = new URL(login.headers.get('Location')!);
  return {state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')!};
}

function callback(state: string) {
  return SELF.fetch(
    `https://hackweek.test/api/auth/callback?code=one-time-code&state=${encodeURIComponent(state)}`,
    {redirect: 'manual'},
  );
}

function fetchLocal(
  url: string,
  override: Partial<AuthBindings> & {LOCAL_AUTH_IS_ADMIN?: string} = {},
) {
  return app.request(
    url,
    {},
    {
      DB: env.DB,
      ATTACHMENTS: env.ATTACHMENTS,
      ...localBrowserAuthBindings,
      ...override,
    },
  );
}
