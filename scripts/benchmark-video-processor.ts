#!/usr/bin/env node
import {execFileSync, spawnSync} from 'node:child_process';
import {chmod, mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = process.cwd();
const image = 'hackweek-video-processor:local';
const work = await mkdtemp(path.join(tmpdir(), 'hackweek-video-benchmark-'));
const container = `hackweek-video-benchmark-${process.pid}`;
const profiles = [
  {name: 'correctness-360p', width: 640, height: 360, duration: 2},
  {name: 'bounded-720p', width: 1280, height: 720, duration: 4},
  {name: 'bounded-1080p', width: 1920, height: 1080, duration: 4},
];
let containerStarted = false;

try {
  run('docker', ['build', '--file', 'Dockerfile.video-processor', '--tag', image, '.']);
  await chmod(work, 0o777);
  for (const profile of profiles) {
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${profile.width}x${profile.height}:rate=24`,
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      String(profile.duration),
      '-af',
      'volume=0.05',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-shortest',
      path.join(work, `${profile.name}-input.mp4`),
    ]);
  }
  await Promise.all(
    profiles.map((profile) => chmod(path.join(work, `${profile.name}-input.mp4`), 0o644)),
  );

  run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--volume',
    `${work}:/work`,
    image,
  ]);
  containerStarted = true;
  const results = [];
  for (const profile of profiles) {
    const input = `/work/${profile.name}-input.mp4`;
    const output = `/work/${profile.name}-output.mp4`;
    const cpuBefore = containerCpuUsec();
    const wallStarted = performance.now();
    const metadata = JSON.parse(
      outputOf('docker', [
        'exec',
        container,
        'node',
        '/app/video-processor.mjs',
        'process-file',
        input,
        output,
      ])
        .trim()
        .split('\n')
        .at(-1)!,
    ) as {width: number; height: number; loudnessLufs: number | null};
    const wallSeconds = (performance.now() - wallStarted) / 1000;
    const cpuSeconds = (containerCpuUsec() - cpuBefore) / 1_000_000;
    const inputBytes = (await stat(path.join(work, `${profile.name}-input.mp4`))).size;
    const outputBytes = (await stat(path.join(work, `${profile.name}-output.mp4`))).size;
    results.push({
      profile: profile.name,
      source: `${profile.width}x${profile.height}, ${profile.duration}s, 24fps`,
      inputBytes,
      outputBytes,
      wallSeconds: Number(wallSeconds.toFixed(3)),
      cpuSeconds: Number(cpuSeconds.toFixed(3)),
      outputResolution: `${metadata.width}x${metadata.height}`,
      loudnessLufs: metadata.loudnessLufs,
    });
  }

  console.table(results);
  console.log(JSON.stringify({image, profiles: results}, null, 2));
} finally {
  if (containerStarted) {
    const removed = spawnSync('docker', ['rm', '--force', container], {
      cwd: root,
      stdio: 'ignore',
    });
    if (removed.status !== 0) {
      console.error(`Could not remove benchmark container ${container}`);
      process.exitCode = 1;
    }
  }
  await rm(work, {recursive: true, force: true});
}

function containerCpuUsec() {
  const stats = outputOf('docker', [
    'exec',
    container,
    'sh',
    '-c',
    "awk '/^usage_usec / {print $2}' /sys/fs/cgroup/cpu.stat",
  ]).trim();
  const value = Number(stats);
  if (!Number.isFinite(value)) throw new Error(`Invalid container CPU usage: ${stats}`);
  return value;
}

function ffmpeg(args: string[]) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args]);
}

function run(command: string, args: string[]) {
  execFileSync(command, args, {cwd: root, stdio: 'inherit'});
}

function outputOf(command: string, args: string[]) {
  return execFileSync(command, args, {cwd: root, encoding: 'utf8'});
}
