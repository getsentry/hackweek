import {Hono} from 'hono';

import {
  exchangeAuthorizationCode,
  googleAuthorizationUrl,
  verifyGoogleIdToken,
} from '../integrations/google-oauth';
import {
  assertRequestUsesConfiguredOrigin,
  AuthenticationError,
  clearSessionCookie,
  readAuthConfig,
  sessionCookie,
  type AuthBindings,
  type AuthVariables,
} from '../middleware/auth';
import {
  cleanupExpiredAuthRecords,
  createSession,
  randomBase64Url,
  revokeSessionByTokenHash,
  revokeUserSessions,
  sha256Hex,
} from '../services/sessions';
import {synchronizeGoogleUser} from '../services/users';

const LOGIN_ATTEMPT_TTL_SECONDS = 10 * 60;

interface AuthEnv {
  Bindings: AuthBindings & {DB: D1Database};
  Variables: AuthVariables;
}

export const authRoutes = new Hono<AuthEnv>();
export const authenticatedAuthRoutes = new Hono<AuthEnv>();

// Keep auth navigation same-origin and fixed. There is deliberately no `returnTo` input.
authRoutes.get('/login', async (c) => {
  try {
    const config = readAuthConfig(c.env);
    assertRequestUsesConfiguredOrigin(c.req.raw, config);

    const now = Math.floor(Date.now() / 1000);
    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    await cleanupExpiredAuthRecords(c.env.DB, now);
    await c.env.DB.prepare(
      `INSERT INTO oauth_login_attempts
        (state_hash, nonce, code_verifier, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        await sha256Hex(state),
        nonce,
        codeVerifier,
        now + LOGIN_ATTEMPT_TTL_SECONDS,
        now,
      )
      .run();
    return c.redirect(googleAuthorizationUrl(config, {state, nonce, codeChallenge}));
  } catch (error) {
    return callbackFailure(c, error);
  }
});

authRoutes.get('/callback', async (c) => {
  const config = safeConfig(c);
  if (!config) return callbackErrorRedirect(c, 'configuration');
  try {
    assertRequestUsesConfiguredOrigin(c.req.raw, config);
    const state = c.req.query('state');
    const code = c.req.query('code');
    if (
      c.req.query('error') ||
      !state ||
      !code ||
      state.length > 1024 ||
      code.length > 4096
    ) {
      throw new AuthenticationError('AUTH_INVALID', 'Google authorization failed', 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const stateHash = await sha256Hex(state);
    const consumed = await c.env.DB.prepare(
      `UPDATE oauth_login_attempts SET consumed_at = ?
       WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
       RETURNING nonce, code_verifier`,
    )
      .bind(now, stateHash, now)
      .first<{nonce: string; code_verifier: string}>();
    if (!consumed) {
      throw new AuthenticationError(
        'AUTH_INVALID',
        'Login attempt is invalid, expired, or already used',
        401,
      );
    }

    const idToken = await exchangeAuthorizationCode(
      c.env,
      config,
      code,
      consumed.code_verifier,
    );
    const identity = await verifyGoogleIdToken(c.env, config, idToken, consumed.nonce);
    const user = await synchronizeGoogleUser(c.env.DB, identity);
    await revokeUserSessions(c.env.DB, user.id, now);
    const session = await createSession(c.env.DB, user.id, now);
    c.header('Set-Cookie', sessionCookie(session.token, config));
    return c.redirect('/');
  } catch (error) {
    return callbackFailure(c, error);
  }
});

authenticatedAuthRoutes.post('/logout', async (c) => {
  const config = readAuthConfig(c.env);
  await revokeSessionByTokenHash(c.env.DB, c.get('sessionTokenHash'));
  c.header('Set-Cookie', clearSessionCookie(config));
  return c.redirect('/', 303);
});

function safeConfig(c: {env: AuthBindings}) {
  try {
    return readAuthConfig(c.env);
  } catch {
    return null;
  }
}

function callbackFailure(c: Parameters<typeof callbackErrorRedirect>[0], error: unknown) {
  const reason =
    error instanceof AuthenticationError && error.code === 'AUTH_FORBIDDEN'
      ? 'forbidden'
      : 'failed';
  return callbackErrorRedirect(c, reason);
}

function callbackErrorRedirect(c: {redirect: (url: string) => Response}, reason: string) {
  return c.redirect(`/?auth_error=${encodeURIComponent(reason)}`);
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
