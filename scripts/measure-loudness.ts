import {spawn} from 'node:child_process';
import process from 'node:process';

interface QueueItem {
  videoId: string;
  downloadUrl: string;
}

const apiUrl = required('VIDEO_API_URL').replace(/\/$/, '');
const serviceToken = required('VIDEO_SERVICE_TOKEN');
const queue = await request<{videos: QueueItem[]}>('/api/video-jobs/measurements');

for (const video of queue.videos) {
  try {
    const measurement = await measure(video.downloadUrl);
    await request(`/api/video-jobs/measurements/${encodeURIComponent(video.videoId)}`, {
      method: 'POST',
      body: JSON.stringify(measurement),
    });
    console.log(`Measured ${video.videoId}: ${measurement.loudnessLufs} LUFS`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await request(
      `/api/video-jobs/measurements/${encodeURIComponent(video.videoId)}/failure`,
      {
        method: 'POST',
        body: JSON.stringify({error: message}),
      },
    );
    console.error(`Measurement failed for ${video.videoId}: ${message}`);
  }
}

async function measure(url: string) {
  const output = await run('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-i',
    url,
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ]);
  const blocks = [...output.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  const json = blocks.at(-1)?.[0];
  if (!json) throw new Error('ffmpeg loudnorm output did not contain JSON');
  const parsed = JSON.parse(json) as {input_i?: string; input_duration?: string};
  const loudnessLufs = Number(parsed.input_i);
  const durationSeconds = Number(parsed.input_duration);
  if (!Number.isFinite(loudnessLufs) || !Number.isFinite(durationSeconds)) {
    throw new Error('ffmpeg returned invalid loudness or duration');
  }
  return {loudnessLufs, durationSeconds};
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve(stderr)
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`)),
    );
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
