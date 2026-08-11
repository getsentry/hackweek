import {env, SELF} from 'cloudflare:test';
import {beforeEach, describe, expect, it} from 'vitest';

import {createSessionCookie} from '../auth/fixture';

let suffix = 1000;
let yearId: string;
let groupId: string;
let projectId: string;
let memberToken: string;
let outsiderToken: string;

beforeEach(async () => {
  suffix += 1;
  yearId = `media-year-${suffix}`;
  groupId = `media-group-${suffix}`;
  memberToken = await createSessionCookie({
    sub: `media-member-${suffix}`,
    email: `media-member-${suffix}@sentry.io`,
  });
  outsiderToken = await createSessionCookie({
    sub: `media-outsider-${suffix}`,
    email: `media-outsider-${suffix}@sentry.io`,
  });
  const user = await synchronize(memberToken, `media-member-${suffix}`);
  await synchronize(outsiderToken, `media-outsider-${suffix}`);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO years (id) VALUES (?)').bind(yearId),
    env.DB.prepare(
      `INSERT INTO groups (id, source_id, year_id, name, creator_id)
       VALUES (?, ?, ?, 'Media lab', ?)`,
    ).bind(groupId, groupId, yearId, user),
    env.DB.prepare(
      `INSERT INTO projects
        (id, source_id, year_id, creator_id, group_id, name, summary)
       VALUES (?, ?, ?, ?, ?, 'Private archive', 'Media test project')`,
    ).bind(`media-project-${suffix}`, `media-project-${suffix}`, yearId, user, groupId),
    env.DB.prepare(
      `INSERT INTO project_members (project_id, user_id) VALUES (?, ?)`,
    ).bind(`media-project-${suffix}`, user),
  ]);
  projectId = `media-project-${suffix}`;
});

describe('private project media', () => {
  it('uploads to a deterministic private R2 key and downloads through the Worker', async () => {
    const uploaded = await upload(memberToken, 'Sketch #1.txt', 'private bytes');
    const row = await env.DB.prepare('SELECT r2_key, status FROM media WHERE id = ?')
      .bind(uploaded.body.media.id)
      .first<{r2_key: string; status: string}>();
    const object = await env.ATTACHMENTS.get(row!.r2_key);
    const download = await request(
      `/api/media/${uploaded.body.media.id}/content`,
      memberToken,
    );

    expect(uploaded.response.status).toBe(201);
    expect(row).toEqual({
      r2_key: `projects/${projectId}/media/${uploaded.body.media.id}/Sketch-1.txt`,
      status: 'available',
    });
    expect(await object?.text()).toBe('private bytes');
    expect(download.status).toBe(200);
    expect(download.headers.get('Cache-Control')).toMatch(/^private/);
    expect(download.headers.get('Content-Disposition')).toContain('attachment');
    expect(await download.text()).toBe('private bytes');
  });

  it('rejects media writes from non-members and when submissions close', async () => {
    const outsider = await upload(outsiderToken, 'nope.txt', 'blocked');
    await env.DB.prepare('UPDATE years SET submissions_closed = 1 WHERE id = ?')
      .bind(yearId)
      .run();
    const closed = await upload(memberToken, 'late.txt', 'blocked');

    expect(outsider.response.status).toBe(403);
    expect(outsider.body).toMatchObject({error: {code: 'AUTH_FORBIDDEN'}});
    expect(closed.response.status).toBe(403);
  });

  it('deletes both metadata and the private object for authorized members', async () => {
    const uploaded = await upload(memberToken, 'delete.txt', 'gone soon');
    const row = await env.DB.prepare('SELECT r2_key FROM media WHERE id = ?')
      .bind(uploaded.body.media.id)
      .first<{r2_key: string}>();

    const deleted = await request(`/api/media/${uploaded.body.media.id}`, memberToken, {
      method: 'DELETE',
    });
    const metadata = await env.DB.prepare('SELECT id FROM media WHERE id = ?')
      .bind(uploaded.body.media.id)
      .first();

    expect(deleted.status).toBe(204);
    expect(metadata).toBeNull();
    expect(await env.ATTACHMENTS.get(row!.r2_key)).toBeNull();
  });

  it('marks metadata missing when an R2 object cannot be found', async () => {
    const uploaded = await upload(memberToken, 'vanished.txt', 'gone');
    const row = await env.DB.prepare('SELECT r2_key FROM media WHERE id = ?')
      .bind(uploaded.body.media.id)
      .first<{r2_key: string}>();
    await env.ATTACHMENTS.delete(row!.r2_key);

    const missing = await request(
      `/api/media/${uploaded.body.media.id}/content`,
      memberToken,
    );
    const stored = await env.DB.prepare('SELECT status FROM media WHERE id = ?')
      .bind(uploaded.body.media.id)
      .first<{status: string}>();

    expect(missing.status).toBe(404);
    expect(stored?.status).toBe('missing');
  });
});

async function upload(token: string, name: string, contents: string) {
  const data = new FormData();
  data.set('file', new File([contents], name, {type: 'text/plain'}));
  const response = await request(`/api/media/projects/${projectId}`, token, {
    method: 'POST',
    body: data,
  });
  const body = await response.clone().json<any>();
  return {response, body};
}

async function synchronize(token: string, subject: string) {
  await request('/api/session', token);
  const row = await env.DB.prepare('SELECT id FROM users WHERE google_subject = ?')
    .bind(subject)
    .first<{id: string}>();
  return row!.id;
}

function request(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', token);
  if (init?.method && init.method !== 'GET')
    headers.set('Origin', 'https://hackweek.test');
  return SELF.fetch(`https://hackweek.test${path}`, {...init, headers});
}
