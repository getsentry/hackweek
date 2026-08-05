import type {SessionUser} from '../../shared/api';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionIdentity {
  subject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface SessionRow {
  token_hash: string;
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: number;
  google_subject: string | null;
}

export async function createSession(db: D1Database, userId: string, now = nowSeconds()) {
  const token = randomBase64Url(32);
  const tokenHash = await sha256Hex(token);
  await db
    .prepare(
      `INSERT INTO user_sessions
        (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(tokenHash, userId, now + SESSION_TTL_SECONDS, now, now)
    .run();
  return {token, tokenHash, expiresAt: now + SESSION_TTL_SECONDS};
}

export async function findUserBySessionToken(
  db: D1Database,
  token: string,
  now = nowSeconds(),
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.token_hash, s.user_id, u.email, u.display_name, u.avatar_url,
              u.is_admin, u.google_subject
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<SessionRow>();
  if (!row) return null;

  await db
    .prepare('UPDATE user_sessions SET last_used_at = ? WHERE token_hash = ?')
    .bind(now, tokenHash)
    .run();
  return {
    tokenHash,
    identity: {
      subject: row.google_subject ?? `user:${row.user_id}`,
      email: row.email.toLowerCase(),
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    user: toSessionUser(row),
  };
}

export async function revokeSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
  now = nowSeconds(),
) {
  await db
    .prepare(
      `UPDATE user_sessions SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(now, tokenHash)
    .run();
}

export async function revokeUserSessions(
  db: D1Database,
  userId: string,
  now = nowSeconds(),
) {
  await db
    .prepare(
      `UPDATE user_sessions SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL`,
    )
    .bind(now, userId)
    .run();
}

export async function cleanupExpiredAuthRecords(db: D1Database, now = nowSeconds()) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM oauth_login_attempts
         WHERE expires_at <= ? OR consumed_at IS NOT NULL`,
      )
      .bind(now),
    db
      .prepare(
        `DELETE FROM user_sessions
         WHERE expires_at <= ? OR revoked_at IS NOT NULL`,
      )
      .bind(now),
  ]);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function randomBase64Url(bytes: number) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function toSessionUser(row: SessionRow): SessionUser {
  return {
    id: row.user_id,
    email: row.email.toLowerCase(),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.is_admin === 1 ? 'admin' : 'member',
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
