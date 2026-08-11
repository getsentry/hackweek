#!/usr/bin/env node
import {execFileSync, spawnSync} from 'node:child_process';
import {chmod, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = process.cwd();
const image = 'hackweek-video-processor:local';
const work = await mkdtemp(path.join(tmpdir(), 'hackweek-processor-test-'));
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;

try {
  run('docker', ['build', '--file', 'Dockerfile.video-processor', '--tag', image, '.']);
  const version = output('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'ffmpeg',
    image,
    '-version',
  ]);
  assert(version.startsWith('ffmpeg version 8.0.1 '), 'pinned FFmpeg 8.0.1 runs');

  await chmod(work, 0o777);
  const audible = path.join(work, 'audible.mp4');
  const peakLimited = path.join(work, 'peak-limited.mp4');
  const lowSilent = path.join(work, 'low-silent.mp4');
  const rotationBase = path.join(work, 'rotation-base.mp4');
  const rotated = path.join(work, 'rotated.mp4');
  const overDuration = path.join(work, 'over-duration.mp4');
  const malformed = path.join(work, 'malformed.mp4');

  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:sample_rate=48000',
    '-t',
    '2',
    '-af',
    'volume=0.05',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    '-shortest',
    audible,
  ]);
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'color=size=320x180:rate=15:color=black',
    '-f',
    'lavfi',
    '-i',
    'aevalsrc=0.003*sin(2*PI*440*t)+if(between(t\\,1\\,1.005)\\,0.5\\,0):s=48000:c=stereo',
    '-t',
    '3.5',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    '-shortest',
    peakLimited,
  ]);
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=15',
    '-t',
    '1.5',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-an',
    lowSilent,
  ]);
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=15',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-an',
    rotationBase,
  ]);
  ffmpeg(['-display_rotation:v:0', '90', '-i', rotationBase, '-c', 'copy', rotated]);
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'color=size=64x64:rate=1:color=black',
    '-t',
    '601',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-an',
    overDuration,
  ]);
  await writeFile(malformed, 'not a media file');
  await Promise.all(
    [audible, peakLimited, lowSilent, rotationBase, rotated, overDuration, malformed].map(
      (file) => chmod(file, 0o644),
    ),
  );

  const audibleResult = processFixture('audible.mp4', 'audible-output.mp4');
  const audibleProbe = probe(path.join(work, 'audible-output.mp4'));
  assertCanonical(audibleProbe);
  assert(
    audibleResult.audioMode === 'normalized',
    'audible input uses two-pass loudnorm',
  );
  assert(
    typeof audibleResult.loudnessLufs === 'number' &&
      Math.abs(audibleResult.loudnessLufs + 16) <= 0.7,
    `audible output is ${String(audibleResult.loudnessLufs)} LUFS within ±0.7 LU`,
  );
  assert(
    await fastStart(path.join(work, 'audible-output.mp4')),
    'MP4 moov precedes mdat',
  );

  const peakLimitedResult = processFixture('peak-limited.mp4', 'peak-limited-output.mp4');
  assertCanonical(probe(path.join(work, 'peak-limited-output.mp4')));
  assert(
    peakLimitedResult.audioMode === 'normalized',
    'peak-limited input remains normalized',
  );
  assert(
    typeof peakLimitedResult.loudnessLufs === 'number' &&
      Math.abs(peakLimitedResult.loudnessLufs + 16) <= 0.7,
    `peak-limited output is ${String(peakLimitedResult.loudnessLufs)} LUFS within ±0.7 LU`,
  );
  assert(
    await fastStart(path.join(work, 'peak-limited-output.mp4')),
    'corrective audio pass preserves MP4 fast start',
  );

  const silentResult = processFixture('low-silent.mp4', 'low-silent-output.mp4');
  const silentProbe = probe(path.join(work, 'low-silent-output.mp4'));
  assertCanonical(silentProbe);
  const silentVideo = silentProbe.streams.find(
    (stream) => stream.codec_type === 'video',
  )!;
  assert(
    silentVideo.width === 320 && silentVideo.height === 180,
    'low-resolution input is not upscaled',
  );
  assert(
    silentResult.audioMode === 'generated-silence',
    'input without audio receives deterministic AAC silence',
  );

  const rotatedResult = processFixture('rotated.mp4', 'rotated-output.mp4');
  assert(
    rotatedResult.width === 180 && rotatedResult.height === 320,
    'rotation metadata is applied without upscaling',
  );
  assertCanonical(probe(path.join(work, 'rotated-output.mp4')));

  expectFixtureFailure('malformed.mp4', 'malformed-output.mp4', 'ffprobe exited');
  expectFixtureFailure('over-duration.mp4', 'over-output.mp4', 'exceeds 600s');
  expectFixtureFailure('audible.mp4', 'missing/output.mp4', 'No such file');

  console.log('Video processor: 36 checks passed');
} finally {
  await rm(work, {recursive: true, force: true});
}

function processFixture(input: string, outputFile: string) {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      `${uid}:${gid}`,
      '--volume',
      `${work}:/work`,
      image,
      'process-file',
      `/work/${input}`,
      `/work/${outputFile}`,
    ],
    {cwd: root, encoding: 'utf8'},
  );
  if (result.status !== 0) {
    throw new Error(`Processor failed:\n${result.stdout}\n${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!) as {
    width: number;
    height: number;
    loudnessLufs: number | null;
    audioMode: string;
  };
}

function expectFixtureFailure(input: string, outputFile: string, message: string) {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      `${uid}:${gid}`,
      '--volume',
      `${work}:/work`,
      image,
      'process-file',
      `/work/${input}`,
      `/work/${outputFile}`,
    ],
    {cwd: root, encoding: 'utf8'},
  );
  assert(result.status !== 0, `${input} is rejected deterministically`);
  assert(
    `${result.stdout}\n${result.stderr}`.includes(message),
    `${input} reports ${message}`,
  );
}

function assertCanonical(result: Probe) {
  const video = result.streams.find((stream) => stream.codec_type === 'video');
  const audio = result.streams.find((stream) => stream.codec_type === 'audio');
  assert(video?.codec_name === 'h264', 'output video codec is H.264');
  assert(video?.pix_fmt === 'yuv420p', 'output pixel format is yuv420p');
  assert(
    (video?.width ?? 0) <= 1920 && (video?.height ?? 0) <= 1080,
    'output is <=1080p',
  );
  assert(audio?.codec_name === 'aac', 'output audio codec is AAC');
  assert(Number(result.format.duration) <= 600.05, 'output duration is <=600 seconds');
}

function probe(file: string) {
  return JSON.parse(
    output('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,pix_fmt',
      '-of',
      'json',
      file,
    ]),
  ) as Probe;
}

interface Probe {
  streams: Array<{
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
  }>;
  format: {duration: string};
}

async function fastStart(file: string) {
  const bytes = await readFile(file);
  const moov = bytes.indexOf(Buffer.from('moov'));
  const mdat = bytes.indexOf(Buffer.from('mdat'));
  return moov >= 0 && mdat >= 0 && moov < mdat;
}

function ffmpeg(args: string[]) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args]);
}

function run(command: string, args: string[]) {
  execFileSync(command, args, {cwd: root, stdio: 'inherit'});
}

function output(command: string, args: string[]) {
  return execFileSync(command, args, {cwd: root, encoding: 'utf8'});
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Video processor check failed: ${message}`);
  console.log(`✓ ${message}`);
}
