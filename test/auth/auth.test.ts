import {env, SELF} from 'cloudflare:test';
import {decodeJwt} from 'jose';
import {beforeEach, describe, expect, it} from 'vitest';

import {verifyAccessIdentity} from '../../src/worker/middleware/auth';
import {localAuthBindings, signAccessToken} from './fixture';

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

function base64Url(value: object) {
  return btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
