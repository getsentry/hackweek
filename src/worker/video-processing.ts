export const VIDEO_PROCESSOR_TARGET_LUFS = -16;
export const VIDEO_PROCESSOR_LOUDNESS_TOLERANCE_LU = 0.7;
export const VIDEO_PROCESSOR_MAX_DURATION_SECONDS = 600;

export interface VideoProcessingParams {
  videoId: string;
  attempt: number;
}

export interface VideoProcessorResult {
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: 'h264';
  audioCodec: 'aac';
  pixelFormat: 'yuv420p';
  loudnessLufs: number | null;
  loudnessTargetLufs: number;
  loudnessToleranceLu: number;
  audioMode: 'normalized' | 'generated-silence';
  fastStart: true;
  sha256: string;
}

export function videoWorkflowInstanceId(videoId: string, attempt: number) {
  return `video-${videoId}-attempt-${attempt}`;
}
