import {createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload} from 'jose';

import {isJsonString} from '../../shared/json';
import {
  assertAllowedEmail,
  AuthenticationError,
  type AuthBindings,
  type AuthConfig,
} from '../middleware/auth';
import type {SessionIdentity} from '../services/sessions';

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface TokenExchangeResponse {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

export function googleAuthorizationUrl(
  config: AuthConfig,
  attempt: {state: string; nonce: string; codeChallenge: string},
) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId!,
    redirect_uri: config.callbackUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: attempt.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export async function exchangeAuthorizationCode(
  env: AuthBindings,
  config: AuthConfig,
  code: string,
  codeVerifier: string,
) {
  const endpoint = env.GOOGLE_TOKEN_ENDPOINT ?? GOOGLE_TOKEN_ENDPOINT;
  if (endpoint !== GOOGLE_TOKEN_ENDPOINT && !env.GOOGLE_JWKS_JSON) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'A custom Google token endpoint is test-only and requires local JWKS',
      500,
    );
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        code,
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        redirect_uri: config.callbackUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
  } catch {
    throw new AuthenticationError('AUTH_INVALID', 'Google token exchange failed', 401);
  }
  let body: TokenExchangeResponse;
  try {
    body = await response.json();
  } catch {
    throw new AuthenticationError('AUTH_INVALID', 'Google token exchange failed', 401);
  }
  if (!response.ok || body.error || !body.id_token || body.refresh_token) {
    throw new AuthenticationError('AUTH_INVALID', 'Google token exchange failed', 401);
  }
  return body.id_token;
}

export async function verifyGoogleIdToken(
  env: AuthBindings,
  config: AuthConfig,
  idToken: string,
  expectedNonce: string,
): Promise<SessionIdentity> {
  const keySet = env.GOOGLE_JWKS_JSON
    ? createLocalJWKSet(parseJwks(env.GOOGLE_JWKS_JSON))
    : createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));
  let payload: JWTPayload;
  try {
    ({payload} = await jwtVerify(idToken, keySet, {
      algorithms: ['RS256'],
      issuer: GOOGLE_ISSUERS,
      audience: config.clientId,
    }));
  } catch {
    throw new AuthenticationError('AUTH_INVALID', 'Google ID token is invalid', 401);
  }

  if (
    payload.aud !== config.clientId ||
    payload.nonce !== expectedNonce ||
    !isJsonString(payload.sub) ||
    !payload.sub
  ) {
    throw new AuthenticationError('AUTH_INVALID', 'Google ID token is invalid', 401);
  }
  if (payload.email_verified !== true || !isJsonString(payload.email)) {
    throw new AuthenticationError(
      'AUTH_FORBIDDEN',
      'Verified Google email is required',
      403,
    );
  }
  const email = payload.email.trim().toLowerCase();
  assertAllowedEmail(email, config.allowedEmailDomain);
  const displayName =
    isJsonString(payload.name) && payload.name.trim()
      ? payload.name.trim().slice(0, 100)
      : email.slice(0, email.lastIndexOf('@'));
  return {
    subject: payload.sub,
    email,
    displayName,
    avatarUrl: safeAvatarUrl(payload.picture),
  };
}

function parseJwks(value: string) {
  try {
    const parsed: {keys?: unknown} = JSON.parse(value);
    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) throw new Error();
    // SAFETY: createLocalJWKSet performs the authoritative validation of every JWK.
    return parsed as Parameters<typeof createLocalJWKSet>[0];
  } catch {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Google test JWKS configuration is invalid',
      500,
    );
  }
}

function safeAvatarUrl<T>(value: T) {
  if (!isJsonString(value) || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
