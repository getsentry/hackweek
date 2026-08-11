import {
  Container,
  type OutboundHandler,
  type OutboundHandlerContext,
} from '@cloudflare/containers';

import type {VideoProcessingParams} from '../video-processing';

interface ProcessorContainerEnv {
  DB: D1Database;
  VIDEOS: R2Bucket;
}

interface ProcessingStorageRow {
  original_r2_key: string;
  output_r2_key: string;
}

export class VideoProcessorContainer extends Container<ProcessorContainerEnv> {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '5m';
  enableInternet = false;
  allowedHosts = ['video-r2'];
}

const videoR2Handler: OutboundHandler<
  ProcessorContainerEnv,
  VideoProcessingParams
> = async (request, env, ctx) => {
  const scope = requireScope(request, ctx);
  const storage = await currentStorage(env.DB, scope);
  if (!storage || storage.original_r2_key === storage.output_r2_key) {
    return new Response('Processing attempt is no longer current', {status: 409});
  }

  const pathname = new URL(request.url).pathname;
  if (request.method === 'GET' && pathname === '/source') {
    const object = await env.VIDEOS.get(storage.original_r2_key);
    if (!object) return new Response('Immutable original is missing', {status: 404});
    const headers = new Headers({'content-length': String(object.size)});
    object.writeHttpMetadata(headers);
    return new Response(object.body, {headers});
  }
  if (request.method === 'PUT' && pathname === '/output') {
    if (!request.body) return new Response('Derivative body is required', {status: 400});
    const checksum = request.headers.get('x-content-sha256');
    if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
      return new Response('Derivative checksum is invalid', {status: 400});
    }
    const existing = await env.VIDEOS.head(storage.output_r2_key);
    if (existing) {
      return existing.customMetadata?.sha256 === checksum
        ? new Response(null, {status: 204})
        : new Response('Immutable derivative already exists', {status: 409});
    }
    try {
      await env.VIDEOS.put(storage.output_r2_key, request.body, {
        httpMetadata: {contentType: 'video/mp4'},
        customMetadata: {
          videoId: scope.videoId,
          attempt: String(scope.attempt),
          sha256: checksum,
        },
      });
      return new Response(null, {status: 201});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(`Derivative R2 write failed: ${message}`, {status: 500});
    }
  }
  return new Response('Scoped video storage route not found', {status: 404});
};

VideoProcessorContainer.outboundHandlers = {videoR2: videoR2Handler};

async function currentStorage(db: D1Database, scope: VideoProcessingParams) {
  return db
    .prepare(
      `SELECT pv.original_r2_key, vpa.output_r2_key
       FROM project_videos pv
       JOIN video_processing_attempts vpa
         ON vpa.video_id = pv.id AND vpa.attempt = ?
       WHERE pv.id = ? AND pv.processing_attempt = ?
         AND pv.status = 'processing' AND pv.retired_at IS NULL
         AND vpa.status = 'running' AND vpa.output_r2_key IS NOT NULL`,
    )
    .bind(scope.attempt, scope.videoId, scope.attempt)
    .first<ProcessingStorageRow>();
}

function requireScope(
  request: Request,
  ctx: OutboundHandlerContext<VideoProcessingParams>,
) {
  const scope = ctx.params;
  if (
    !scope ||
    request.headers.get('x-video-id') !== scope.videoId ||
    request.headers.get('x-video-attempt') !== String(scope.attempt)
  ) {
    throw new Error('Container request escaped its processing-attempt scope');
  }
  return scope;
}
