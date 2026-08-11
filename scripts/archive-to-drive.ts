import {spawn} from 'node:child_process';
import process from 'node:process';

interface QueueItem {
  videoId: string;
  fileName: string;
  downloadUrl: string;
}

const apiUrl = required('VIDEO_API_URL').replace(/\/$/, '');
const serviceToken = required('VIDEO_SERVICE_TOKEN');
const driveDestination = required('RCLONE_DRIVE_DESTINATION').replace(/\/$/, '');
const queue = await request<{videos: QueueItem[]}>('/api/video-jobs/archives');

for (const video of queue.videos) {
  try {
    await run('rclone', [
      'copyurl',
      '--no-clobber',
      video.downloadUrl,
      `${driveDestination}/${video.fileName}`,
    ]);
    await report(video.videoId, 'archived', null);
    console.log(`Archived ${video.videoId} as ${video.fileName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report(video.videoId, 'failed', message);
    console.error(`Archive failed for ${video.videoId}: ${message}`);
  }
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'inherit', 'pipe']});
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`rclone exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

function report(videoId: string, status: 'archived' | 'failed', error: string | null) {
  return request(`/api/video-jobs/archives/${encodeURIComponent(videoId)}`, {
    method: 'POST',
    body: JSON.stringify({status, error}),
  });
}

async function request<T = unknown>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: new Headers({
      Authorization: `Bearer ${serviceToken}`,
      ...(init.body ? {'Content-Type': 'application/json'} : {}),
      ...Object.fromEntries(new Headers(init.headers).entries()),
    }),
  });
  if (!response.ok)
    throw new Error(`Video API returned ${response.status}: ${await response.text()}`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
