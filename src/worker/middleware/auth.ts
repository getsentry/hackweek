import {createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload} from 'jose';
import {createMiddleware} from 'hono/factory';

import type {ApiErrorCode, ApiErrorResponse, SessionUser} from '../../shared/api';

export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';

export interface AccessIdentity {
  subject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthVariables {
  identity: AccessIdentity;
  user: SessionUser;
}

export interface AuthBindings {
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ALLOWED_EMAIL_DOMAIN: string;
  AUTH_MODE?: string;
  LOCAL_ACCESS_JWKS?: string;
  LOCAL_AUTH_EMAIL?: string;
  LOCAL_AUTH_NAME?: string;
  LOCAL_AUTH_SUBJECT?: string;
}

export class AuthenticationError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: 401 | 403 | 500,
  ) {
    super(message);
  }
}

export function accessIdentity<
  E extends {
    Bindings: AuthBindings;
    Variables: AuthVariables;
  },
>() {
  return createMiddleware<E>(async (c, next) => {
    let identity: AccessIdentity;
    try {
      identity = await verifyAccessIdentity(c.req.raw, c.env);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        const response: ApiErrorResponse = {
          error: {code: error.code, message: error.message},
        };
        return c.json(response, error.status);
      }
      const response: ApiErrorResponse = {
        error: {code: 'AUTH_INVALID', message: 'Cloudflare Access token is invalid'},
      };
      return c.json(response, 401);
    }

    c.set('identity', identity);
    await next();
  });
}

export async function verifyAccessIdentity(
  request: Request,
  env: AuthBindings,
): Promise<AccessIdentity> {
  const config = readAuthConfig(env);
  if (config.mode === 'local') {
    if (!isLoopbackHostname(new URL(request.url).hostname)) {
      throw new AuthenticationError(
        'AUTH_FORBIDDEN',
        'Local authentication is restricted to loopback hosts',
        403,
      );
    }
    return config.identity;
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) {
    throw new AuthenticationError(
      'AUTH_REQUIRED',
      'Cloudflare Access token is required',
      401,
    );
  }

  try {
    const keySet = config.localJwks
      ? createLocalJWKSet(config.localJwks)
      : createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`));
    const {payload} = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      issuer: config.issuer,
      audience: config.audience,
    });
    return identityFromPayload(payload, config.allowedEmailDomain);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Cloudflare Access token is invalid',
      401,
    );
  }
}

function readAuthConfig(env: AuthBindings) {
  const authMode = env.AUTH_MODE ?? 'access';
  const allowedEmailDomain = readAllowedEmailDomain(env.ALLOWED_EMAIL_DOMAIN);
  const localIdentityConfigured = [
    env.LOCAL_AUTH_SUBJECT,
    env.LOCAL_AUTH_EMAIL,
    env.LOCAL_AUTH_NAME,
  ].some((value) => value !== undefined);

  if (authMode === 'local') {
    if (
      env.ACCESS_AUD !== undefined ||
      env.ACCESS_TEAM_DOMAIN !== undefined ||
      env.LOCAL_ACCESS_JWKS !== undefined
    ) {
      throw new AuthenticationError(
        'AUTH_CONFIG_INVALID',
        'Access configuration cannot be used in local authentication mode',
        500,
      );
    }
    return {
      mode: authMode,
      identity: localIdentityFromConfig(env, allowedEmailDomain),
    } as const;
  }

  if (authMode !== 'access' && authMode !== 'local-signed') {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Authentication mode is invalid',
      500,
    );
  }

  if (localIdentityConfigured) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local identity configuration cannot be used in signed authentication modes',
      500,
    );
  }

  const audience = env.ACCESS_AUD?.trim();
  const issuer = readAccessIssuer(env.ACCESS_TEAM_DOMAIN);
  if (!audience) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Cloudflare Access authentication is not configured',
      500,
    );
  }

  if (authMode === 'access' && env.LOCAL_ACCESS_JWKS !== undefined) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local authentication keys cannot be used in Access mode',
      500,
    );
  }

  if (authMode === 'local-signed' && !env.LOCAL_ACCESS_JWKS?.trim()) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local signed authentication requires an explicit key set',
      500,
    );
  }

  return {
    mode: authMode,
    audience,
    allowedEmailDomain,
    issuer,
    localJwks:
      authMode === 'local-signed' ? parseLocalJwks(env.LOCAL_ACCESS_JWKS!) : undefined,
  } as const;
}

function readAllowedEmailDomain(value: string | undefined) {
  const domain = value?.trim().toLowerCase();
  if (
    !domain ||
    domain.length > 253 ||
    !domain.split('.').every((label) => /^(?!-)[a-z0-9-]+(?<!-)$/.test(label))
  ) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Allowed email domain is invalid',
      500,
    );
  }
  return domain;
}

function readAccessIssuer(value: string | undefined) {
  try {
    const issuerUrl = new URL(value?.trim() ?? '');
    if (
      issuerUrl.protocol !== 'https:' ||
      !issuerUrl.hostname.endsWith('.cloudflareaccess.com') ||
      issuerUrl.pathname !== '/' ||
      issuerUrl.search ||
      issuerUrl.hash
    ) {
      throw new Error('invalid issuer');
    }
    return issuerUrl.origin;
  } catch {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Cloudflare Access team domain is invalid',
      500,
    );
  }
}

function localIdentityFromConfig(env: AuthBindings, allowedDomain: string) {
  const subject = env.LOCAL_AUTH_SUBJECT?.trim();
  const email = env.LOCAL_AUTH_EMAIL?.trim().toLowerCase();
  const displayName = env.LOCAL_AUTH_NAME?.trim();
  if (
    !subject ||
    subject.length > 255 ||
    !/^[a-zA-Z0-9._:@/-]+$/.test(subject) ||
    !email ||
    email.length > 254 ||
    !isValidEmailAddress(email) ||
    !displayName ||
    displayName.length > 100 ||
    Array.from(displayName).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local authentication identity is invalid',
      500,
    );
  }

  assertAllowedEmail(email, allowedDomain);
  return {subject, email, displayName, avatarUrl: null};
}

function isLoopbackHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function isValidEmailAddress(email: string) {
  const at = email.lastIndexOf('@');
  const localPart = at === -1 ? '' : email.slice(0, at);
  return (
    at > 0 &&
    email.indexOf('@') === at &&
    localPart.length <= 64 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
  );
}

function assertAllowedEmail(email: string, allowedDomain: string) {
  const at = email.lastIndexOf('@');
  const domain = at === -1 ? '' : email.slice(at + 1);
  if (!isValidEmailAddress(email) || domain !== allowedDomain) {
    throw new AuthenticationError(
      'AUTH_FORBIDDEN',
      'Email domain is not authorized',
      403,
    );
  }
}

function parseLocalJwks(value: string) {
  try {
    const jwks = JSON.parse(value) as {keys?: unknown};
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new Error('empty key set');
    }
    return jwks as Parameters<typeof createLocalJWKSet>[0];
  } catch {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local authentication key set is invalid',
      500,
    );
  }
}

function identityFromPayload(payload: JWTPayload, allowedDomain: string): AccessIdentity {
  if (payload.type !== 'app') {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Access application token is required',
      401,
    );
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Access identity is missing a subject',
      401,
    );
  }

  if (typeof payload.email !== 'string') {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Access identity is missing an email',
      401,
    );
  }

  const email = payload.email.trim().toLowerCase();
  assertAllowedEmail(email, allowedDomain);
  const at = email.lastIndexOf('@');

  const displayName =
    typeof payload.name === 'string' && payload.name.trim().length > 0
      ? payload.name.trim().slice(0, 100)
      : email.slice(0, at);
  const avatarUrl = safeAvatarUrl(payload.picture);

  return {subject: payload.sub, email, displayName, avatarUrl};
}

function safeAvatarUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
