import type {SessionUser, UpdateProfileRequest} from '../../shared/api';
import type {SessionIdentity} from './sessions';

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
  };
}

export async function findUserByLocalIdentity(
  db: D1Database,
  identity: SessionIdentity,
): Promise<SessionUser> {
  const user = await findByEmail(db, identity.email);
  if (user) return toSessionUser(user);

  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO users (id, source_uid, email, display_name, avatar_url)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
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
  };
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
  return {
    id: row.id,
    email: row.email.toLowerCase(),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.is_admin === 1 ? 'admin' : 'member',
  };
}

export class UserIdentityConflictError extends Error {}
