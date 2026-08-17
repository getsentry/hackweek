import {createHash} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdtemp, open, rename, rm, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const TARGET_LUFS = -16;
const LOUDNESS_TOLERANCE_LU = 0.7;
const MAX_DURATION_SECONDS = 600;
const PROGRESS_REPORT_TIMEOUT_MS = 5_000;
const PORT = Number(process.env.PORT ?? 8080);
const R2_ORIGIN = process.env.VIDEO_R2_ORIGIN ?? 'http://video-r2';
const SCALE_FILTER =
  "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";

class ProcessorError extends Error {}

export async function processFile(inputPath, outputPath, report) {
  report('inspecting', null);
  const source = await probe(inputPath);
  const sourceVideo = source.streams.find((stream) => stream.codec_type === 'video');
  if (!sourceVideo || !positive(sourceVideo.width) || !positive(sourceVideo.height)) {
    throw new ProcessorError('Input does not contain a valid video stream');
  }
  const durationSeconds = mediaDuration(source);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new ProcessorError('Input duration is invalid');
  }
  if (durationSeconds > MAX_DURATION_SECONDS + 0.01) {
    throw new ProcessorError(
      `Input duration ${durationSeconds.toFixed(3)}s exceeds ${MAX_DURATION_SECONDS}s`,
    );
  }

  const hasAudio = source.streams.some((stream) => stream.codec_type === 'audio');
  let firstPass = null;
  if (hasAudio) {
    report('analyzing_audio', 0);
    firstPass = await analyzeLoudness(inputPath, durationSeconds, (progress) =>
      report('analyzing_audio', progress),
    );
  }
  const normalizeAudio = firstPass !== null && firstPass.inputI > -70;
  report('transcoding', 0);
  await transcode(
    inputPath,
    outputPath,
    firstPass,
    normalizeAudio,
    durationSeconds,
    (progress) => report('transcoding', progress),
  );

  report('checking_output', null);
  let canonical = await validateCanonicalOutput(outputPath, sourceVideo);
  report('checking_output', 0);
  let measured = await analyzeLoudness(outputPath, canonical.outputDuration, (progress) =>
    report('checking_output', progress),
  );
  let loudnessLufs = measured?.inputI ?? null;
  if (normalizeAudio && measured && outsideLoudnessTolerance(loudnessLufs)) {
    const correctedPath = `${outputPath}.loudness.mp4`;
    report('correcting_loudness', 0);
    await correctLoudness(
      outputPath,
      correctedPath,
      measured,
      canonical.outputDuration,
      (progress) => report('correcting_loudness', progress),
    );
    await rename(correctedPath, outputPath);
    report('checking_output', null);
    canonical = await validateCanonicalOutput(outputPath, sourceVideo);
    report('checking_output', 0);
    measured = await analyzeLoudness(outputPath, canonical.outputDuration, (progress) =>
      report('checking_output', progress),
    );
    loudnessLufs = measured?.inputI ?? null;
  }
  if (normalizeAudio && outsideLoudnessTolerance(loudnessLufs)) {
    throw new ProcessorError(
      `Output loudness ${String(loudnessLufs)} LUFS is outside ${LOUDNESS_TOLERANCE_LU} LU of ${TARGET_LUFS}`,
    );
  }

  report('finalizing', null);
  const digest = await sha256(outputPath);
  report('finalizing', 100);
  return {
    durationSeconds: canonical.outputDuration,
    width: canonical.video.width,
    height: canonical.video.height,
    videoCodec: canonical.video.codec_name,
    audioCodec: canonical.audio.codec_name,
    pixelFormat: canonical.video.pix_fmt,
    loudnessLufs,
    loudnessTargetLufs: TARGET_LUFS,
    loudnessToleranceLu: LOUDNESS_TOLERANCE_LU,
    audioMode: normalizeAudio ? 'normalized' : 'generated-silence',
    fastStart: canonical.fastStart,
    sha256: digest,
  };
}

async function transcode(
  inputPath,
  outputPath,
  firstPass,
  normalizeAudio,
  durationSeconds,
  onProgress,
) {
  const args = ['-hide_banner', '-nostdin', '-y', '-i', inputPath];
  if (!normalizeAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }
  args.push('-map', '0:v:0', '-map', normalizeAudio ? '0:a:0' : '1:a:0');
  args.push('-vf', SCALE_FILTER);
  if (normalizeAudio) args.push('-af', loudnormFilter(firstPass));
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-profile:v',
    'high',
    '-level:v',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-map_metadata',
    '-1',
    '-metadata:s:v:0',
    'rotate=0',
    '-sn',
    '-dn',
    '-movflags',
    '+faststart',
    '-max_muxing_queue_size',
    '4096',
    '-shortest',
    outputPath,
  );
  await runFfmpeg(args, durationSeconds, onProgress);
}

async function correctLoudness(
  inputPath,
  outputPath,
  measured,
  durationSeconds,
  onProgress,
) {
  await runFfmpeg(
    [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-c:v',
      'copy',
      '-af',
      loudnormFilter(measured),
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-map_metadata',
      '-1',
      '-sn',
      '-dn',
      '-movflags',
      '+faststart',
      '-shortest',
      outputPath,
    ],
    durationSeconds,
    onProgress,
  );
}

function loudnormFilter(measured) {
  return [
    `loudnorm=I=${TARGET_LUFS}`,
    'LRA=11',
    'TP=-1.5',
    `measured_I=${measured.inputI}`,
    `measured_LRA=${measured.inputLra}`,
    `measured_TP=${measured.inputTp}`,
    `measured_thresh=${measured.inputThresh}`,
    `offset=${measured.targetOffset}`,
    'linear=true',
    'print_format=summary',
  ].join(':');
}

async function validateCanonicalOutput(outputPath, sourceVideo) {
  const output = await probe(outputPath);
  const video = output.streams.find((stream) => stream.codec_type === 'video');
  const audio = output.streams.find((stream) => stream.codec_type === 'audio');
  const outputDuration = mediaDuration(output);
  if (
    !video ||
    !audio ||
    video.codec_name !== 'h264' ||
    audio.codec_name !== 'aac' ||
    video.pix_fmt !== 'yuv420p' ||
    !positive(video.width) ||
    !positive(video.height) ||
    video.width > 1920 ||
    video.height > 1080 ||
    outputDuration > MAX_DURATION_SECONDS + 0.05
  ) {
    throw new ProcessorError(
      'Canonical output failed codec, pixel, size, or duration checks',
    );
  }

  const rotation = sourceRotation(sourceVideo);
  const sourceWidth =
    Math.abs(rotation) % 180 === 90 ? sourceVideo.height : sourceVideo.width;
  const sourceHeight =
    Math.abs(rotation) % 180 === 90 ? sourceVideo.width : sourceVideo.height;
  if (video.width > sourceWidth || video.height > sourceHeight) {
    throw new ProcessorError('Canonical output unexpectedly upscaled the source');
  }

  const fastStart = await hasFastStart(outputPath);
  if (!fastStart) throw new ProcessorError('Canonical MP4 is not fast-start enabled');
  return {video, audio, outputDuration, fastStart};
}

function outsideLoudnessTolerance(loudnessLufs) {
  return (
    loudnessLufs === null || Math.abs(loudnessLufs - TARGET_LUFS) > LOUDNESS_TOLERANCE_LU
  );
}

async function analyzeLoudness(file, durationSeconds, onProgress) {
  const output = await runFfmpeg(
    [
      '-hide_banner',
      '-nostdin',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-af',
      `loudnorm=I=${TARGET_LUFS}:LRA=11:TP=-1.5:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    durationSeconds,
    onProgress,
  );
  const blocks = [...output.stderr.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  const json = blocks.at(-1)?.[0];
  if (!json) throw new ProcessorError('FFmpeg loudness analysis did not return data');
  const value = JSON.parse(json);
  const parsed = {
    inputI: finite(value.input_i),
    inputTp: finite(value.input_tp),
    inputLra: finite(value.input_lra),
    inputThresh: finite(value.input_thresh),
    targetOffset: finite(value.target_offset),
  };
  return Object.values(parsed).every((item) => item !== null) ? parsed : null;
}

async function probe(file) {
  const output = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,pix_fmt,duration:stream_tags=rotate:stream_side_data=rotation',
    '-of',
    'json',
    file,
  ]);
  try {
    const parsed = JSON.parse(output.stdout);
    if (!Array.isArray(parsed.streams)) throw new Error('streams missing');
    return parsed;
  } catch {
    throw new ProcessorError('Input is malformed or could not be probed');
  }
}

function mediaDuration(probeResult) {
  const formatDuration = Number(probeResult.format?.duration);
  if (Number.isFinite(formatDuration)) return formatDuration;
  return Math.max(...probeResult.streams.map((stream) => Number(stream.duration) || 0));
}

function sourceRotation(stream) {
  const sideData = Array.isArray(stream.side_data_list)
    ? stream.side_data_list.find((entry) => Number.isFinite(Number(entry.rotation)))
    : null;
  return Number(sideData?.rotation ?? stream.tags?.rotate ?? 0);
}

async function hasFastStart(file) {
  const handle = await open(file, 'r');
  try {
    const {size} = await stat(file);
    const buffer = Buffer.alloc(Math.min(size, 2 * 1024 * 1024));
    await handle.read(buffer, 0, buffer.length, 0);
    const moov = buffer.indexOf(Buffer.from('moov'));
    const mdat = buffer.indexOf(Buffer.from('mdat'));
    return moov >= 0 && mdat >= 0 && moov < mdat;
  } finally {
    await handle.close();
  }
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function runFfmpeg(args, durationSeconds, onProgress) {
  const output = await run(
    'ffmpeg',
    ['-progress', 'pipe:1', '-stats_period', '2', '-nostats', ...args],
    (line) => {
      const match = /^out_time_us=(\d+)$/.exec(line);
      if (!match) return;
      const elapsedSeconds = Number(match[1]) / 1_000_000;
      onProgress(
        Math.min(100, Math.max(0, Math.round((elapsedSeconds / durationSeconds) * 100))),
      );
    },
  );
  onProgress(100);
  return output;
}

function run(command, args, onStdoutLine = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    let pendingLine = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!onStdoutLine) return;
      pendingLine += chunk;
      for (;;) {
        const newline = pendingLine.indexOf('\n');
        if (newline < 0) break;
        onStdoutLine(pendingLine.slice(0, newline).trim());
        pendingLine = pendingLine.slice(newline + 1);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (onStdoutLine && pendingLine.trim()) onStdoutLine(pendingLine.trim());
      if (code === 0) resolve({stdout, stderr});
      else
        reject(new ProcessorError(`${command} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function processRequest(payload) {
  const {videoId, attempt} = validatePayload(payload);
  const reporter = createProgressReporter(videoId, attempt);
  const directory = await mkdtemp(path.join(tmpdir(), 'hackweek-video-'));
  const input = path.join(directory, 'original');
  const output = path.join(directory, 'canonical.mp4');
  try {
    const source = await fetch(`${R2_ORIGIN}/source`, {
      headers: {'x-video-id': videoId, 'x-video-attempt': String(attempt)},
    });
    if (!source.ok || !source.body) {
      throw new ProcessorError(`Scoped original download failed with ${source.status}`);
    }
    const sourceSize = contentLength(source.headers.get('content-length'));
    reporter.update('downloading', sourceSize === null ? null : 0);
    await pipeline(
      Readable.fromWeb(source.body),
      byteProgress(sourceSize, (progress) => reporter.update('downloading', progress)),
      createWriteStream(input, {flags: 'wx'}),
    );
    const result = await processFile(input, output, reporter.update);
    const outputSize = (await stat(output)).size;
    reporter.update('uploading', 0);
    const uploadBody = createReadStream(output).pipe(
      byteProgress(outputSize, (progress) => reporter.update('uploading', progress)),
    );
    const uploaded = await fetch(`${R2_ORIGIN}/output`, {
      method: 'PUT',
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(outputSize),
        'x-video-id': videoId,
        'x-video-attempt': String(attempt),
        'x-content-sha256': result.sha256,
      },
      body: Readable.toWeb(uploadBody),
      duplex: 'half',
    });
    if (!uploaded.ok) {
      throw new ProcessorError(`Scoped derivative upload failed with ${uploaded.status}`);
    }
    reporter.update('uploading', 100);
    return result;
  } finally {
    await reporter.flush();
    await rm(directory, {recursive: true, force: true});
  }
}

function createProgressReporter(videoId, attempt) {
  let stage = null;
  let progress = null;
  let lastUpdate = 0;
  let tail = Promise.resolve();

  function update(nextStage, nextProgress) {
    const now = Date.now();
    const stageChanged = nextStage !== stage;
    const completed = nextProgress === 100 && progress !== 100;
    if (
      !stageChanged &&
      !completed &&
      (nextProgress === progress || now - lastUpdate < 2_000)
    ) {
      return;
    }
    stage = nextStage;
    progress = nextProgress;
    lastUpdate = now;
    tail = tail.then(async () => {
      try {
        const response = await fetch(`${R2_ORIGIN}/progress`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-video-id': videoId,
            'x-video-attempt': String(attempt),
          },
          body: JSON.stringify({stage: nextStage, progress: nextProgress}),
          signal: AbortSignal.timeout(PROGRESS_REPORT_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`progress endpoint returned ${response.status}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          JSON.stringify({
            component: 'video-processor',
            event: 'progress_update_failed',
            videoId,
            attempt,
            stage: nextStage,
            message,
          }),
        );
      }
    });
  }

  return {update, flush: () => tail};
}

function byteProgress(totalBytes, onProgress) {
  let transferred = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      transferred += chunk.byteLength;
      if (totalBytes !== null) {
        onProgress(Math.min(100, Math.round((transferred / totalBytes) * 100)));
      }
      callback(null, chunk);
    },
  });
}

function contentLength(value) {
  if (!value || !/^\d+$/.test(value)) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) && length > 0 ? length : null;
}

function validatePayload(value) {
  if (
    !value ||
    Object.prototype.toString.call(value) !== '[object Object]' ||
    Object.prototype.toString.call(value.videoId) !== '[object String]' ||
    !/^[a-zA-Z0-9-]{1,128}$/.test(value.videoId) ||
    !Number.isInteger(value.attempt) ||
    value.attempt < 1
  ) {
    throw new ProcessorError('Processor request is invalid');
  }
  return {videoId: value.videoId, attempt: value.attempt};
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new ProcessorError('Processor request is too large');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ProcessorError('Processor request must contain JSON');
  }
}

let processingTail = Promise.resolve();
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/ping') {
    response.writeHead(200, {'content-type': 'text/plain'}).end('ok');
    return;
  }
  if (request.method !== 'POST' || request.url !== '/process') {
    response.writeHead(404).end();
    return;
  }
  const task = processingTail.then(async () => {
    try {
      const result = await processRequest(await readJson(request));
      response
        .writeHead(200, {'content-type': 'application/json'})
        .end(JSON.stringify(result));
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error';
      response
        .writeHead(error instanceof ProcessorError ? 422 : 500, {
          'content-type': 'application/json',
        })
        .end(JSON.stringify({error: message}));
    }
  });
  processingTail = task.catch(() => undefined);
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv[2] === 'process-file') {
    const [, , , input, output] = process.argv;
    if (!input || !output) throw new Error('Usage: process-file <input> <output>');
    console.log(JSON.stringify(await processFile(input, output, () => undefined)));
  } else if (process.argv.length === 2) {
    server.listen(PORT, '0.0.0.0', () =>
      console.log(`video processor listening on ${PORT}`),
    );
  } else {
    throw new Error('Unknown video processor command');
  }
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  return Number.isInteger(value) && value > 0;
}
