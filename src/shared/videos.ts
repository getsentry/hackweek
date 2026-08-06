export type StreamMode = 'disabled' | 'fake' | 'real';

export type VideoStatus =
  | 'pending_upload'
  | 'uploading'
  | 'processing'
  | 'measuring'
  | 'ready'
  | 'failed';

export type VideoFailureStage = 'upload' | 'stream' | 'measurement';
export type ArchiveStatus = 'pending' | 'archiving' | 'archived' | 'failed';

export interface ProjectVideo {
  id: string;
  projectId: string;
  streamUid: string | null;
  sourceMediaId: string | null;
  status: VideoStatus;
  durationSeconds: number | null;
  loudnessLufs: number | null;
  gainDb: number | null;
  errorMessage: string | null;
  failureStage: VideoFailureStage | null;
  archiveStatus: ArchiveStatus;
  archiveError: string | null;
}

export interface DirectUploadRequest {
  fileName: string;
  fileSize: number;
}

export interface DirectUploadResponse {
  video: ProjectVideo;
  upload: {
    protocol: 'tus';
    url: string;
    expiresAt: string;
    chunkSize: number;
  };
}

export interface HistoricalPromotionRequest {
  sourceMediaId: string;
}

export interface PlaybackResponse {
  mode: 'stream' | 'fake';
  manifestUrl: string | null;
  expiresAt: string;
}

export interface PlaylistItem {
  videoId: string;
  projectId: string;
  projectName: string;
  durationSeconds: number;
  gainDb: number;
  position: number;
}

export interface ProjectVideoResponse {
  video: ProjectVideo | null;
  streamMode: StreamMode;
}

export interface PlaylistResponse {
  videos: PlaylistItem[];
  streamMode: StreamMode;
}

export interface MeasurementQueueItem {
  videoId: string;
  projectId: string;
  downloadUrl: string;
}

export interface MeasurementQueueResponse {
  videos: MeasurementQueueItem[];
}

export interface MeasurementResultRequest {
  loudnessLufs: number;
  durationSeconds: number;
}

export interface ArchiveQueueItem {
  videoId: string;
  projectId: string;
  fileName: string;
  downloadUrl: string;
}

export interface ArchiveQueueResponse {
  videos: ArchiveQueueItem[];
}
