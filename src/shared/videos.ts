export type VideoStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type VideoFailureStage = 'processing';
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
  teamMembers: string[];
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
