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
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ALLOWED_EMAIL_DOMAIN: string;
  AUTH_MODE?: string;
  LOCAL_ACCESS_JWKS?: string;
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
  const audience = env.ACCESS_AUD?.trim();
  const allowedEmailDomain = env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  const rawIssuer = env.ACCESS_TEAM_DOMAIN?.trim();

  if (!audience || !allowedEmailDomain || !rawIssuer) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Cloudflare Access authentication is not configured',
      500,
    );
  }

  let issuer: string;
  try {
    const issuerUrl = new URL(rawIssuer);
    if (
      issuerUrl.protocol !== 'https:' ||
      !issuerUrl.hostname.endsWith('.cloudflareaccess.com') ||
      issuerUrl.pathname !== '/' ||
      issuerUrl.search ||
      issuerUrl.hash
    ) {
      throw new Error('invalid issuer');
    }
    issuer = issuerUrl.origin;
  } catch {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Cloudflare Access team domain is invalid',
      500,
    );
  }

  const authMode = env.AUTH_MODE ?? 'access';
  if (authMode !== 'access' && authMode !== 'local-signed') {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Authentication mode is invalid',
      500,
    );
  }

  if (authMode === 'access' && env.LOCAL_ACCESS_JWKS) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local authentication keys cannot be used in Access mode',
      500,
    );
  }

  if (authMode === 'local-signed' && !env.LOCAL_ACCESS_JWKS) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local signed authentication requires an explicit key set',
      500,
    );
  }

  let localJwks: ReturnType<typeof parseLocalJwks> | undefined;
  if (authMode === 'local-signed') {
    localJwks = parseLocalJwks(env.LOCAL_ACCESS_JWKS!);
  }

  return {audience, allowedEmailDomain, issuer, localJwks};
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
  const at = email.lastIndexOf('@');
  const domain = at === -1 ? '' : email.slice(at + 1);
  if (!email || domain !== allowedDomain) {
    throw new AuthenticationError(
      'AUTH_FORBIDDEN',
      'Email domain is not authorized',
      403,
    );
  }

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
