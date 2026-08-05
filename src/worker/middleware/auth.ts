import {createMiddleware} from 'hono/factory';

import type {ApiErrorCode, ApiErrorResponse, SessionUser} from '../../shared/api';
import {findUserBySessionToken, type SessionIdentity} from '../services/sessions';
import {findUserByLocalIdentity} from '../services/users';

export const SESSION_COOKIE_NAME = '__Host-sentry-hackweek-session';
export const LOCAL_SESSION_COOKIE_NAME = 'sentry-hackweek-session';

export interface AuthVariables {
  identity: SessionIdentity;
  user: SessionUser;
  sessionTokenHash: string | null;
}

export interface AuthBindings {
  ALLOWED_EMAIL_DOMAIN: string;
  APP_ORIGIN?: string;
  AUTH_MODE?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_JWKS_JSON?: string;
  GOOGLE_TOKEN_ENDPOINT?: string;
  LOCAL_AUTH_EMAIL?: string;
  LOCAL_AUTH_NAME?: string;
  LOCAL_AUTH_SUBJECT?: string;
}

export interface AuthConfig {
  mode: 'google' | 'local';
  allowedEmailDomain: string;
  appOrigin: string;
  callbackUri: string;
  secureCookie: boolean;
  clientId?: string;
  clientSecret?: string;
  localIdentity?: SessionIdentity;
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

export function authenticateRequest<
  E extends {
    Bindings: AuthBindings & {DB: D1Database};
    Variables: AuthVariables;
  },
>() {
  return createMiddleware<E>(async (c, next) => {
    try {
      const config = readAuthConfig(c.env);
      if (config.mode === 'local') {
        assertRequestUsesConfiguredOrigin(c.req.raw, config);
        const user = await findUserByLocalIdentity(c.env.DB, config.localIdentity!);
        c.set('identity', config.localIdentity!);
        c.set('user', user);
        c.set('sessionTokenHash', null);
      } else {
        assertRequestUsesConfiguredOrigin(c.req.raw, config);
        const token = readCookie(
          c.req.header('Cookie'),
          config.secureCookie ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME,
        );
        if (!token) {
          throw new AuthenticationError('AUTH_REQUIRED', 'Sign in is required', 401);
        }
        const session = await findUserBySessionToken(c.env.DB, token);
        if (!session) {
          throw new AuthenticationError(
            'AUTH_REQUIRED',
            'Your session has expired. Sign in again.',
            401,
          );
        }
        c.set('identity', session.identity);
        c.set('user', session.user);
        c.set('sessionTokenHash', session.tokenHash);
      }
      await next();
    } catch (error) {
      return authenticationErrorResponse(c, error);
    }
  });
}

export function protectMutationOrigin<
  E extends {Bindings: AuthBindings; Variables: AuthVariables},
>() {
  return createMiddleware<E>(async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      try {
        const config = readAuthConfig(c.env);
        assertRequestUsesConfiguredOrigin(c.req.raw, config);
        const origin = c.req.header('Origin');
        if (!origin || origin !== config.appOrigin) {
          throw new AuthenticationError(
            'AUTH_FORBIDDEN',
            'Cross-origin mutation rejected',
            403,
          );
        }
      } catch (error) {
        return authenticationErrorResponse(c, error);
      }
    }
    await next();
  });
}

export function readAuthConfig(env: AuthBindings): AuthConfig {
  const mode = env.AUTH_MODE;
  if (mode !== 'google' && mode !== 'local') {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'AUTH_MODE must be explicitly configured as google or local',
      500,
    );
  }

  const allowedEmailDomain = readAllowedEmailDomain(env.ALLOWED_EMAIL_DOMAIN);
  const appOrigin = readAppOrigin(env.APP_ORIGIN, mode);
  const secureCookie = appOrigin.startsWith('https://');
  const callbackUri = `${appOrigin}/api/auth/callback`;
  if (env.GOOGLE_REDIRECT_URI !== undefined && env.GOOGLE_REDIRECT_URI !== callbackUri) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'GOOGLE_REDIRECT_URI must exactly match APP_ORIGIN plus /api/auth/callback',
      500,
    );
  }

  const localIdentityConfigured = [
    env.LOCAL_AUTH_SUBJECT,
    env.LOCAL_AUTH_EMAIL,
    env.LOCAL_AUTH_NAME,
  ].some((value) => value !== undefined);
  const googleConfigured = [
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_JWKS_JSON,
    env.GOOGLE_TOKEN_ENDPOINT,
  ].some((value) => value !== undefined);

  if (mode === 'local') {
    if (googleConfigured) {
      throw new AuthenticationError(
        'AUTH_CONFIG_INVALID',
        'Google configuration cannot be used in local authentication mode',
        500,
      );
    }
    return {
      mode,
      allowedEmailDomain,
      appOrigin,
      callbackUri,
      secureCookie,
      localIdentity: localIdentityFromConfig(env, allowedEmailDomain),
    };
  }

  if (localIdentityConfigured) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Local identity configuration cannot be used in Google authentication mode',
      500,
    );
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      'Google OAuth client configuration is incomplete',
      500,
    );
  }
  return {
    mode,
    allowedEmailDomain,
    appOrigin,
    callbackUri,
    secureCookie,
    clientId,
    clientSecret,
  };
}

export function assertRequestUsesConfiguredOrigin(request: Request, config: AuthConfig) {
  if (new URL(request.url).origin !== config.appOrigin) {
    throw new AuthenticationError(
      config.mode === 'local' ? 'AUTH_FORBIDDEN' : 'AUTH_INVALID',
      'Request origin does not match the configured application origin',
      config.mode === 'local' ? 403 : 401,
    );
  }
}

export function sessionCookie(token: string, config: AuthConfig) {
  const name = config.secureCookie ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME;
  return `${name}=${token}; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax${config.secureCookie ? '; Secure' : ''}`;
}

export function clearSessionCookie(config: AuthConfig) {
  const name = config.secureCookie ? SESSION_COOKIE_NAME : LOCAL_SESSION_COOKIE_NAME;
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${config.secureCookie ? '; Secure' : ''}`;
}

function readAppOrigin(value: string | undefined, mode: 'google' | 'local') {
  try {
    const url = new URL(value?.trim() ?? '');
    const loopback = isLoopbackHostname(url.hostname);
    if (
      url.origin !== url.toString().replace(/\/$/, '') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      (mode === 'local' && !loopback)
    ) {
      throw new Error('invalid origin');
    }
    return url.origin;
  } catch {
    throw new AuthenticationError(
      'AUTH_CONFIG_INVALID',
      mode === 'local'
        ? 'Local APP_ORIGIN must be an exact loopback HTTP origin'
        : 'APP_ORIGIN must be an exact HTTPS origin or an HTTP loopback origin',
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

export function readAllowedEmailDomain(value: string | undefined) {
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

export function assertAllowedEmail(email: string, allowedDomain: string) {
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

function isLoopbackHostname(hostname: string) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function authenticationErrorResponse(c: {json: Function}, error: unknown) {
  const authError =
    error instanceof AuthenticationError
      ? error
      : new AuthenticationError('AUTH_INVALID', 'Authentication failed', 401);
  const response: ApiErrorResponse = {
    error: {code: authError.code, message: authError.message},
  };
  return c.json(response, authError.status);
}
