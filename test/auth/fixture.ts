import {env} from 'cloudflare:test';
import {importJWK, SignJWT, type JWTPayload} from 'jose';

import {isJsonString} from '../../src/shared/json';
import {SESSION_COOKIE_NAME} from '../../src/worker/middleware/auth';
import {createSession} from '../../src/worker/services/sessions';
import {synchronizeGoogleUser} from '../../src/worker/services/users';

export const googleAuthBindings = {
  APP_ORIGIN: 'https://hackweek.test',
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REDIRECT_URI: 'https://hackweek.test/api/auth/callback',
  GOOGLE_TOKEN_ENDPOINT: 'https://tokens.hackweek.test/token',
  ALLOWED_EMAIL_DOMAIN: 'sentry.io',
  GOOGLE_JWKS_JSON:
    '{"keys":[{"kty":"RSA","n":"3SSum9jtxKTheDwctdDnp80Mv5_hAQzcKJJcxpw3wShOU0LyEpt23riO3ncaOC4iVm5xseM9PJmFjYMQJcplKi6I3nDC7tToFWrFqrn7LSjdvJS3WqUjn20CUiUxYZ3QLZcYyERU6M39M8nE1zFHQ3tHz7YkjoNQTPMUXMRydeL8yuBizdsrGQosgpGJceTAFIHJkKtdCipbSBZA3qrrE-HDJa9nZSYloywLVsaxzKJG2SiJzvVBydZbCQ2ZQeR44qdpCIibU2IMyVelKqiCqHwoBwzYybGx4Tcx4N_1UrNZQnECbcN7jSzxRp1agrK6p2w-svyYYXmt7ymqa3kjdQ","e":"AQAB","kid":"google-test","alg":"RS256","use":"sig"}]}',
} as const;

const privateJwk = {
  kty: 'RSA',
  n: '3SSum9jtxKTheDwctdDnp80Mv5_hAQzcKJJcxpw3wShOU0LyEpt23riO3ncaOC4iVm5xseM9PJmFjYMQJcplKi6I3nDC7tToFWrFqrn7LSjdvJS3WqUjn20CUiUxYZ3QLZcYyERU6M39M8nE1zFHQ3tHz7YkjoNQTPMUXMRydeL8yuBizdsrGQosgpGJceTAFIHJkKtdCipbSBZA3qrrE-HDJa9nZSYloywLVsaxzKJG2SiJzvVBydZbCQ2ZQeR44qdpCIibU2IMyVelKqiCqHwoBwzYybGx4Tcx4N_1UrNZQnECbcN7jSzxRp1agrK6p2w-svyYYXmt7ymqa3kjdQ',
  e: 'AQAB',
  d: 'FagL-XMrBcDn27B3V07YANTR1MpBbKrnvIlo0IJn62CZGwpJTo0u_OyyARNE3A-YiUJTnAoW6yJVs-AL6seBVLot6Sq9zEnJWJ-WL_v6nxeLb3ZY5mWZsXkpawX9agPcaTqM0L_wWMQjcbjmr_RBeFhQVgUOW258pKyBZ_xNAUJEs94fQu10sYvC1NduesLuCtHmuhAxqCs-DtSroy2y07xGTM5iYLC0IqM7lzFYA3H8MneRq5Fupg72tJs9KLdqzwQmCpK7Uxw_xLNJMzUDR_olJU3iCAC9QgNuPkP4eRt_-SJu_RJ1sgu3zxexR3PaewDgTmtbPKYj4WRwi9lKgQ',
  p: '_JOiure2sl1vnI513uG19CipuPKfx9gpnc6yj68ku8zwgOZpBXmOqzOEX-Z8HAVThSQJ0M3tclt6JmjVVSvtuk9xUg08WfY71Nekhi75dnCmJ8UOd_pzUvW25hvVOlwZ8Tj7cuVKAebH3s0TsHtn8SQtsTG2wYXIZJcMV7VMzuU',
  q: '4CP7ZdSypZtGyGkg4PZmIPjZhNoUXojXufYMt9AjlO8QxMv4yxn6XfuG32900WtTjrZ8S0RlniZrA2vjoiSenH5aBsIlzruKdiGaUJV7kq4qhLURoW6vM_h6JJyquxRvuGzsV3h2LHydo43mghhRpolpqLyPPx_s8AOej-NVKVE',
  dp: '61h9htHsEGLzvsMXnahfLLQ_ATBCJaqLjJmu1Cd0aPFbICCRtyI_B9MnA1z2Q_3KhwK_iqp3F9mZBfUk4wndp36irrvaglDoCzkr-kQG-o-YovIAu1bI4oJF_D_u_UQYgCaCVdrEjOUHU9lvAUDb51u4n6UdD1GjGeeM_qTWfuk',
  dq: 'oUei3JoY1esOGqTywIzr3evR8LNPFtrWh3vRmO4OvFrtMP4oDlSp_7g-S0YSw6G7pSQP-cTEbfDs7bBTQlehPa_5LYXD2Ka_sdLqC_QTz-68r3Lutb9EGFxB31hPzX-eCBFwWlxWhBpC_-3aIGBJWFDmE0FivaRGREoGbTjCDZE',
  qi: 'Y4xuGMuT0eBDasnfrYr6Gw8mbMs-6TvBOIgSH4V0WGSrR4HGIoQbd0Ikj5mMlWEixUdapdkNH7b-X7Z-Bnoz3mDgvA5mwQs0zXy3s43tgssGRnA7XzCXbzsF_yhz5nGsCsyKBZELZ4zMGaJvVeTY6FV7Fk0MOVDUM6LPMjLidjI',
  kid: 'google-test',
  alg: 'RS256',
  use: 'sig',
};

export async function createSessionCookie(overrides: JWTPayload = {}) {
  const subject = isJsonString(overrides.sub) ? overrides.sub : 'google-member';
  const email = isJsonString(overrides.email) ? overrides.email : 'member@sentry.io';
  const user = await synchronizeGoogleUser(env.DB, {
    subject,
    email: email.toLowerCase(),
    displayName: isJsonString(overrides.name) ? overrides.name : 'Hackweek Member',
    avatarUrl: null,
  });
  const session = await createSession(env.DB, user.id);
  return `${SESSION_COOKIE_NAME}=${session.token}`;
}

export function authenticatedHeaders(cookie: string, mutation = false) {
  const headers = new Headers({Cookie: cookie});
  if (mutation) headers.set('Origin', googleAuthBindings.APP_ORIGIN);
  return headers;
}

export function cookieToken(setCookie: string) {
  const first = setCookie.split(';', 1)[0];
  return first.startsWith(`${SESSION_COOKIE_NAME}=`) ? first : '';
}

export async function signGoogleIdToken(overrides: JWTPayload = {}) {
  const key = await importJWK(privateJwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: 'member@sentry.io',
    email_verified: true,
    name: 'Hackweek Member',
    iss: 'https://accounts.google.com',
    aud: googleAuthBindings.GOOGLE_CLIENT_ID,
    sub: 'google-member',
    nonce: 'test-nonce',
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({alg: 'RS256', kid: privateJwk.kid})
    .sign(key);
}
