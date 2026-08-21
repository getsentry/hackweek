import type {SessionUser, UpdateProfileRequest} from '../../shared/api';
import type {SessionIdentity} from './sessions';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_FETCH_TIMEOUT_MS = 3_000;
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function safeAvatarContentType(value: string | null | undefined) {
  const contentType = value?.split(';', 1)[0].trim().toLowerCase();
  return contentType && ALLOWED_AVATAR_TYPES.has(contentType) ? contentType : null;
}

interface UserRow {
  id: string;
  source_uid: string;
  google_subject: string | null;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: number;
}

export async function synchronizeGoogleUser(
  db: D1Database,
  identity: SessionIdentity,
): Promise<SessionUser> {
  const bySubject = await findBySubject(db, identity.subject);
  if (bySubject && bySubject.email.toLowerCase() !== identity.email) {
    throw new UserIdentityConflictError();
  }

  const user = bySubject ?? (await findByEmail(db, identity.email));
  if (user) {
    if (user.google_subject !== null && user.google_subject !== identity.subject) {
      throw new UserIdentityConflictError();
    }
    try {
      await db
        .prepare(
          `UPDATE users
           SET google_subject = ?, email = ?, display_name = ?, avatar_url = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          identity.subject,
          identity.email,
          identity.displayName,
          identity.avatarUrl,
          user.id,
        )
        .run();
    } catch {
      throw new UserIdentityConflictError();
    }
    return toSessionUser({
      ...user,
      google_subject: identity.subject,
      email: identity.email,
      display_name: identity.displayName,
      avatar_url: identity.avatarUrl,
    });
  }

  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO users
          (id, source_uid, google_subject, email, display_name, avatar_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        id,
        identity.subject,
        identity.email,
        identity.displayName,
        identity.avatarUrl,
      )
      .run();
  } catch {
    throw new UserIdentityConflictError();
  }

  return {
    id,
    email: identity.email,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    role: 'member',
    actualRole: 'member',
  };
}

export async function refreshGoogleUserAvatar(
  bucket: R2Bucket,
  user: Pick<SessionUser, 'id' | 'avatarUrl'>,
) {
  const key = userAvatarKey(user.id);
  try {
    if (!user.avatarUrl) {
      await bucket.delete(key);
      return;
    }
    const avatarUrl = new URL(user.avatarUrl);
    if (!isGoogleusercontentHost(avatarUrl.hostname)) return;

    const signal = AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS);
    const response = await fetch(avatarUrl, {
      redirect: 'manual',
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) return;
      const redirect = new URL(location, avatarUrl);
      if (redirect.protocol !== 'https:' || !isGoogleusercontentHost(redirect.hostname)) {
        return;
      }
      return refreshGoogleUserAvatarFromResponse(
        bucket,
        key,
        await fetch(redirect, {redirect: 'manual', signal}),
      );
    }
    await refreshGoogleUserAvatarFromResponse(bucket, key, response);
  } catch {
    // Profile photos must never prevent sign-in. A previously cached photo remains valid.
  }
}

export function userAvatarKey(userId: string) {
  return `users/${userId}/avatar`;
}

async function refreshGoogleUserAvatarFromResponse(
  bucket: R2Bucket,
  key: string,
  response: Response,
) {
  if (!response.ok) return;
  const contentType = safeAvatarContentType(response.headers.get('Content-Type'));
  if (!contentType) return;
  const declaredSize = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_AVATAR_BYTES) return;
  const content = await response.arrayBuffer();
  if (content.byteLength === 0 || content.byteLength > MAX_AVATAR_BYTES) return;
  await bucket.put(key, content, {
    httpMetadata: {contentType, cacheControl: 'private, max-age=300'},
    customMetadata: {source: 'google'},
  });
}

function isGoogleusercontentHost(hostname: string) {
  return (
    hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com')
  );
}

export async function updateUserProfile(
  db: D1Database,
  userId: string,
  profile: UpdateProfileRequest,
): Promise<SessionUser> {
  await db
    .prepare(
      `UPDATE users
       SET display_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(profile.displayName, profile.avatarUrl, userId)
    .run();

  const user = await db
    .prepare(
      `SELECT id, source_uid, google_subject, email, display_name, avatar_url, is_admin
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<UserRow>();
  if (!user) throw new Error('Authenticated user disappeared');
  return toSessionUser(user);
}

async function findBySubject(db: D1Database, subject: string) {
  return db
    .prepare(
      `SELECT id, source_uid, google_subject, email, display_name, avatar_url, is_admin
       FROM users WHERE google_subject = ?`,
    )
    .bind(subject)
    .first<UserRow>();
}

async function findByEmail(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT id, source_uid, google_subject, email, display_name, avatar_url, is_admin
       FROM users WHERE email = ? COLLATE NOCASE`,
    )
    .bind(email)
    .first<UserRow>();
}

function toSessionUser(row: UserRow): SessionUser {
  const role = row.is_admin === 1 ? 'admin' : 'member';
  return {
    id: row.id,
    email: row.email.toLowerCase(),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role,
    actualRole: role,
  };
}

export class UserIdentityConflictError extends Error {}
