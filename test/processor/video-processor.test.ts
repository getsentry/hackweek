import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';

import {
  isJsonBoolean,
  isJsonObject,
  isJsonString,
  type JsonInput,
  type JsonObject,
} from '../../src/shared/json';

const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe';
const processorPath = fileURLToPath(
  new URL('../../processor/video-processor.mjs', import.meta.url),
);
const pinnedTools = await detectPinnedTools();

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})),
  );
});

describe.skipIf(!pinnedTools.ok)('video processor canonicalization', () => {
  it('converts full-range yuvj420p sources to limited-range yuv420p', async () => {
    const directory = await createTempDir();
    const inputPath = path.join(directory, 'full-range.mp4');
    const outputPath = path.join(directory, 'canonical.mp4');

    await run(ffmpegPath, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:sample_rate=48000',
      '-t',
      '1',
      '-pix_fmt',
      'yuvj420p',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      inputPath,
    ]);

    const source = await probeMedia(inputPath);
    expect(source.pix_fmt).toBe('yuvj420p');
    expect(source.color_range).toBe('pc');

    const processed = await run('node', [
      processorPath,
      'process-file',
      inputPath,
      outputPath,
    ]);
    const result = parseProcessorResult(processed.stdout);
    const canonical = await probeMedia(outputPath);

    expect(result.videoCodec).toBe('h264');
    expect(result.audioCodec).toBe('aac');
    expect(result.pixelFormat).toBe('yuv420p');
    expect(result.fastStart).toBe(true);
    expect(canonical.pix_fmt).toBe('yuv420p');
    expect(canonical.color_range).toBe('tv');
  }, 120_000);
});

async function detectPinnedTools() {
  try {
    const ffmpegVersion = await run(ffmpegPath, ['-version']);
    const ffprobeVersion = await run(ffprobePath, ['-version']);
    const hasFfmpeg8 = ffmpegVersion.stdout.includes('ffmpeg version 8.');
    const hasFfprobe8 = ffprobeVersion.stdout.includes('ffprobe version 8.');
    return {ok: hasFfmpeg8 && hasFfprobe8};
  } catch {
    return {ok: false};
  }
}

async function createTempDir() {
  const directory = await mkdtemp(path.join(tmpdir(), 'hackweek-processor-'));
  tempDirs.push(directory);
  return directory;
}

async function probeMedia(file: string) {
  const output = await run(ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=pix_fmt,color_range,codec_name',
    '-of',
    'json',
    file,
  ]);
  const parsed = parseJsonObject(output.stdout);
  const streams = parsed.streams;
  if (!Array.isArray(streams) || streams.length === 0 || !isJsonObject(streams[0])) {
    throw new Error(`ffprobe returned no video stream for ${file}`);
  }
  const stream = streams[0];
  if (!isJsonString(stream.pix_fmt) || !isJsonString(stream.color_range)) {
    throw new Error(`ffprobe returned incomplete video stream for ${file}`);
  }
  return {
    pix_fmt: stream.pix_fmt,
    color_range: stream.color_range,
  };
}

function parseProcessorResult(stdout: string) {
  const parsed = parseJsonObject(stdout);
  if (
    !isJsonString(parsed.videoCodec) ||
    !isJsonString(parsed.audioCodec) ||
    !isJsonString(parsed.pixelFormat) ||
    !isJsonBoolean(parsed.fastStart)
  ) {
    throw new Error('processor did not return canonical metadata');
  }
  return {
    videoCodec: parsed.videoCodec,
    audioCodec: parsed.audioCodec,
    pixelFormat: parsed.pixelFormat,
    fastStart: parsed.fastStart,
  };
}

function parseJsonObject(text: string): JsonObject {
  let value: JsonInput;
  try {
    // SAFETY: JSON.parse returns JsonInput for processor/ffprobe payloads we own in this test.
    value = JSON.parse(text) as JsonInput;
  } catch {
    throw new Error('expected JSON object');
  }
  if (!isJsonObject(value)) throw new Error('expected JSON object');
  return value;
}

function run(command: string, args: string[]) {
  return new Promise<{stdout: string; stderr: string}>((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({stdout, stderr});
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
