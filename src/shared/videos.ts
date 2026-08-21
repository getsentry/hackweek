export type VideoStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type VideoFailureStage = 'processing';

/** Maximum size, in bytes, accepted for a single project video upload. */
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
export const VIDEO_PROCESSING_STAGES = [
  'waiting_for_processor',
  'downloading',
  'inspecting',
  'analyzing_audio',
  'transcoding',
  'checking_output',
  'correcting_loudness',
  'finalizing',
  'uploading',
] as const;
export type VideoProcessingStage = (typeof VIDEO_PROCESSING_STAGES)[number];

export function isVideoProcessingStage(value: string): value is VideoProcessingStage {
  return VIDEO_PROCESSING_STAGES.some((stage) => stage === value);
}
export type VideoUploadStatus =
  | 'creating'
  | 'uploading'
  | 'completing'
  | 'expiring'
  | 'completed'
  | 'aborted'
  | 'expired';

export interface ProjectVideo {
  id: string;
  projectId: string;
  status: VideoStatus;
  originalName: string;
  contentType: string | null;
  sizeBytes: number;
  durationSeconds: number | null;
  loudnessLufs: number | null;
  gainDb: number | null;
  errorMessage: string | null;
  failureStage: VideoFailureStage | null;
  processingAttempt: number;
  processingStage: VideoProcessingStage | null;
  processingProgress: number | null;
  createdAt: string;
}

export interface VideoUploadPart {
  partNumber: number;
  etag: string;
  sizeBytes: number;
}

export interface VideoUploadSession {
  uploadId: string;
  videoId: string;
  projectId: string;
  fileName: string;
  contentType: string | null;
  fileSize: number;
  partSize: number;
  expiresAt: string;
  status: VideoUploadStatus;
  completedParts: VideoUploadPart[];
}

export interface DirectUploadRequest {
  fileName: string;
  fileSize: number;
  contentType: string | null;
}

export interface DirectUploadResponse {
  video: ProjectVideo | null;
  upload: VideoUploadSession;
}

export interface CompleteVideoUploadRequest {
  parts: Array<{partNumber: number; etag: string}>;
}

export interface PlaybackResponse {
  source: {kind: 'mp4'; url: string};
  expiresAt: null;
}

export interface PlaylistItem {
  videoId: string;
  projectId: string;
  projectName: string;
  groupId: string | null;
  groupName: string | null;
  teamMembers: Array<{id: string; displayName: string}>;
  durationSeconds: number;
  gainDb: number;
  position: number;
}

export interface ProjectVideoResponse {
  video: ProjectVideo | null;
}

export interface PlaylistResponse {
  videos: PlaylistItem[];
}
