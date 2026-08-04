import {env, SELF} from 'cloudflare:test';
import {decodeJwt} from 'jose';
import {beforeEach, describe, expect, it} from 'vitest';

import app from '../../src/worker';
import {type AuthBindings, verifyAccessIdentity} from '../../src/worker/middleware/auth';
import {localAuthBindings, localBrowserAuthBindings, signAccessToken} from './fixture';

const endpoint = 'https://hackweek.test/api/session';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM users').run();
});

describe('Cloudflare Access authentication', () => {
  it('creates a stable normalized D1 profile from a valid signed token', async () => {
    const token = await signAccessToken({email: 'Member@SENTRY.IO', name: 'Member Name'});

    const first = await fetchSession(token);
    const second = await fetchSession(token);

    expect(first.status).toBe(200);
    const firstBody = await first.json<{
      user: {id: string; email: string; role: string};
    }>();
    const secondBody = await second.json<{user: {id: string}}>();
    expect(firstBody.user).toMatchObject({email: 'member@sentry.io', role: 'member'});
    expect(secondBody.user.id).toBe(firstBody.user.id);

    const stored = await env.DB.prepare(
      'SELECT source_uid, access_subject, email, is_admin FROM users WHERE id = ?',
    )
      .bind(firstBody.user.id)
      .first();
    expect(stored).toEqual({
      source_uid: firstBody.user.id,
      access_subject: 'access-member',
      email: 'member@sentry.io',
      is_admin: 0,
    });
  });

  it('links an existing migrated profile by normalized email and preserves source UID/admin role', async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, source_uid, email, display_name, is_admin)
       VALUES (?, ?, ?, ?, 1)`,
    )
      .bind('migrated-user', 'firebase-uid', 'admin@sentry.io', 'Migrated Admin')
      .run();
    const token = await signAccessToken({email: 'ADMIN@sentry.io'});

    const response = await fetchSession(token);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: {id: 'migrated-user', email: 'admin@sentry.io', role: 'admin'},
    });
    const stored = await env.DB.prepare(
      'SELECT source_uid, access_subject FROM users WHERE id = ?',
    )
      .bind('migrated-user')
      .first();
    expect(stored).toEqual({source_uid: 'firebase-uid', access_subject: 'access-member'});
  });

  it('rejects forged identity headers without a signed token', async () => {
    const response = await SELF.fetch(endpoint, {
      headers: {'Cf-Access-Authenticated-User-Email': 'admin@sentry.io'},
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({error: {code: 'AUTH_REQUIRED'}});
  });

  it('rejects a forged token payload with the original signature', async () => {
    const token = await signAccessToken();
    const [header, , signature] = token.split('.');
    const forgedPayload = base64Url({...decodeJwt(token), email: 'admin@sentry.io'});

    const response = await fetchSession(`${header}.${forgedPayload}.${signature}`);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({error: {code: 'AUTH_INVALID'}});
  });

  it('rejects expired tokens', async () => {
    const token = await signAccessToken({exp: Math.floor(Date.now() / 1000) - 60});

    const response = await fetchSession(token);

    expect(response.status).toBe(401);
  });

  it('rejects the wrong audience', async () => {
    const token = await signAccessToken({aud: 'another-application'});

    const response = await fetchSession(token);

    expect(response.status).toBe(401);
  });

  it('rejects the wrong issuer', async () => {
    const token = await signAccessToken({iss: 'https://attacker.example'});

    const response = await fetchSession(token);

    expect(response.status).toBe(401);
  });

  it('rejects users outside the configured company domain', async () => {
    const token = await signAccessToken({email: 'member@sentry.io.attacker.example'});

    const response = await fetchSession(token);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error: {code: 'AUTH_FORBIDDEN'}});
  });

  it('rejects service tokens without a user identity', async () => {
    const token = await signAccessToken({
      sub: '',
      email: undefined,
      common_name: 'service.access',
    });

    const response = await fetchSession(token);

    expect(response.status).toBe(401);
  });

  it('fails closed when production Access configuration is missing', async () => {
    const request = new Request(endpoint, {
      headers: {'Cf-Access-Jwt-Assertion': await signAccessToken()},
    });

    await expect(
      verifyAccessIdentity(request, {
        ...localAuthBindings,
        AUTH_MODE: 'access',
        LOCAL_ACCESS_JWKS: undefined,
        ACCESS_AUD: '',
      }),
    ).rejects.toMatchObject({code: 'AUTH_CONFIG_INVALID'});
  });

  it('cannot activate local keys in production Access mode', async () => {
    const request = new Request(endpoint, {
      headers: {'Cf-Access-Jwt-Assertion': await signAccessToken()},
    });

    await expect(
      verifyAccessIdentity(request, {...localAuthBindings, AUTH_MODE: 'access'}),
    ).rejects.toMatchObject({code: 'AUTH_CONFIG_INVALID'});
  });

  it('rejects a local identity configured alongside production Access', async () => {
    const request = new Request(endpoint, {
      headers: {'Cf-Access-Jwt-Assertion': await signAccessToken()},
    });

    await expect(
      verifyAccessIdentity(request, {
        ...localAuthBindings,
        AUTH_MODE: 'access',
        LOCAL_ACCESS_JWKS: undefined,
        LOCAL_AUTH_SUBJECT: 'local-browser-user',
        LOCAL_AUTH_EMAIL: 'developer@sentry.io',
        LOCAL_AUTH_NAME: 'Local Developer',
      }),
    ).rejects.toMatchObject({code: 'AUTH_CONFIG_INVALID'});
  });
});

describe('local browser authentication', () => {
  it.each([
    'http://localhost:5173/api/session',
    'http://127.0.0.1:5173/api/session',
    'http://[::1]:5173/api/session',
  ])('creates a D1 member for a browser request to %s', async (url) => {
    const response = await fetchLocal(url);

    expect(response.status).toBe(200);
    const body = await response.json<{
      user: {id: string; email: string; displayName: string; role: string};
    }>();
    expect(body.user).toMatchObject({
      email: 'developer@sentry.io',
      displayName: 'Local Developer',
      role: 'member',
    });
    expect(
      await env.DB.prepare(
        'SELECT access_subject, email, is_admin FROM users WHERE id = ?',
      )
        .bind(body.user.id)
        .first(),
    ).toEqual({
      access_subject: 'local-browser-user',
      email: 'developer@sentry.io',
      is_admin: 0,
    });
  });

  it.each([
    'https://hackweek.test/api/session',
    'http://192.168.1.20:5173/api/session',
    'http://127.0.0.2:5173/api/session',
  ])('rejects local mode on non-loopback request URL %s', async (url) => {
    const response = await fetchLocal(url, {headers: {Host: 'localhost'}});

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error: {code: 'AUTH_FORBIDDEN'}});
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first()).toEqual({
      count: 0,
    });
  });

  it.each([
    ['missing subject', {LOCAL_AUTH_SUBJECT: undefined}],
    ['missing email', {LOCAL_AUTH_EMAIL: undefined}],
    ['missing name', {LOCAL_AUTH_NAME: undefined}],
    ['missing allowed domain', {ALLOWED_EMAIL_DOMAIN: undefined}],
    ['blank subject', {LOCAL_AUTH_SUBJECT: '  '}],
    ['invalid subject', {LOCAL_AUTH_SUBJECT: 'local user'}],
    ['malformed email', {LOCAL_AUTH_EMAIL: 'developer@@sentry.io'}],
    ['blank name', {LOCAL_AUTH_NAME: '  '}],
  ])('rejects %s local identity configuration', async (_name, override) => {
    const response = await fetchLocal('http://localhost:5173/api/session', {}, override);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {code: 'AUTH_CONFIG_INVALID'},
    });
  });

  it('rejects a local identity outside the allowed email domain', async () => {
    const response = await fetchLocal(
      'http://localhost:5173/api/session',
      {},
      {LOCAL_AUTH_EMAIL: 'developer@sentry.io.attacker.example'},
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error: {code: 'AUTH_FORBIDDEN'}});
  });

  it.each([
    ['Access audience', {ACCESS_AUD: 'hackweek-local'}],
    [
      'Access issuer',
      {ACCESS_TEAM_DOMAIN: 'https://hackweek-local.cloudflareaccess.com'},
    ],
    ['signed key set', {LOCAL_ACCESS_JWKS: localAuthBindings.LOCAL_ACCESS_JWKS}],
  ])('rejects contradictory local and %s configuration', async (_name, override) => {
    const response = await fetchLocal('http://localhost:5173/api/session', {}, override);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {code: 'AUTH_CONFIG_INVALID'},
    });
  });

  it('does not select local identity implicitly when the mode is absent', async () => {
    const response = await fetchLocal(
      'http://localhost:5173/api/session',
      {},
      {AUTH_MODE: undefined},
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {code: 'AUTH_CONFIG_INVALID'},
    });
  });

  it('rejects unknown modes instead of falling back to local identity', async () => {
    const response = await fetchLocal(
      'http://localhost:5173/api/session',
      {},
      {AUTH_MODE: 'development'},
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {code: 'AUTH_CONFIG_INVALID'},
    });
  });

  it('ignores attempted identity and role escalation from the client', async () => {
    const response = await fetchLocal(
      'http://localhost:5173/api/session?email=admin@sentry.io&role=admin',
      {
        headers: {
          Cookie: 'email=admin@sentry.io; role=admin; is_admin=1',
          'Cf-Access-Authenticated-User-Email': 'admin@sentry.io',
          'Cf-Access-Jwt-Assertion': await signAccessToken({
            email: 'admin@sentry.io',
            role: 'admin',
          }),
          'X-User-Role': 'admin',
        },
      },
      {LOCAL_AUTH_IS_ADMIN: 'true'},
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: {email: 'developer@sentry.io', role: 'member'},
    });
    const admin = await fetchLocal('http://localhost:5173/api/admin/session?role=admin', {
      headers: {'X-User-Role': 'admin'},
    });
    expect(admin.status).toBe(403);
  });

  it('uses only the synchronized D1 role for local administrator access', async () => {
    const memberSession = await fetchLocal('http://localhost:5173/api/session');
    const member = await memberSession.json<{user: {id: string}}>();

    await env.DB.prepare('UPDATE users SET is_admin = 1 WHERE id = ?')
      .bind(member.user.id)
      .run();
    const response = await fetchLocal('http://localhost:5173/api/admin/session');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: {email: 'developer@sentry.io', role: 'admin'},
    });
  });
});

describe('D1-backed authorization and profile', () => {
  it('allows D1 administrators and rejects client role flags for members', async () => {
    await env.DB.prepare(
      `INSERT INTO users
        (id, source_uid, access_subject, email, display_name, is_admin)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
      .bind('admin', 'firebase-admin', 'access-admin', 'admin@sentry.io', 'Admin')
      .run();
    const adminToken = await signAccessToken({
      sub: 'access-admin',
      email: 'admin@sentry.io',
    });
    const memberToken = await signAccessToken({
      sub: 'access-member',
      email: 'member@sentry.io',
      role: 'admin',
      is_admin: true,
    });

    const admin = await SELF.fetch('https://hackweek.test/api/admin/session', {
      headers: {'Cf-Access-Jwt-Assertion': adminToken},
    });
    const member = await SELF.fetch(
      'https://hackweek.test/api/admin/session?role=admin',
      {
        headers: {
          'Cf-Access-Jwt-Assertion': memberToken,
          'X-User-Role': 'admin',
        },
      },
    );

    expect(admin.status).toBe(200);
    expect(await admin.json()).toMatchObject({user: {role: 'admin'}});
    expect(member.status).toBe(403);
  });

  it('updates only the authenticated profile through a validated contract', async () => {
    const token = await signAccessToken();
    await fetchSession(token);

    const updated = await SELF.fetch(`${endpoint}/profile`, {
      method: 'PUT',
      headers: {
        'Cf-Access-Jwt-Assertion': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: '  New Name  ',
        avatarUrl: 'https://example.com/avatar.png',
        role: 'admin',
        email: 'admin@sentry.io',
      }),
    });

    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      user: {
        email: 'member@sentry.io',
        displayName: 'New Name',
        role: 'member',
      },
    });
  });

  it('rejects invalid profile payloads', async () => {
    const token = await signAccessToken();
    await fetchSession(token);

    const response = await SELF.fetch(`${endpoint}/profile`, {
      method: 'PUT',
      headers: {
        'Cf-Access-Jwt-Assertion': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({displayName: '', avatarUrl: 'javascript:alert(1)'}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({error: {code: 'VALIDATION_FAILED'}});
  });
});

function fetchSession(token: string) {
  return SELF.fetch(endpoint, {headers: {'Cf-Access-Jwt-Assertion': token}});
}

function fetchLocal(
  url: string,
  init: RequestInit = {},
  override: Partial<AuthBindings> & {LOCAL_AUTH_IS_ADMIN?: string} = {},
) {
  return app.request(url, init, {
    DB: env.DB,
    ATTACHMENTS: env.ATTACHMENTS,
    ...localBrowserAuthBindings,
    ...override,
  });
}

function base64Url(value: object) {
  return btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
