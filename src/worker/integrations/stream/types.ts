export interface DirectUploadInput {
  creator: string;
  fileName: string;
  fileSize: number;
  maxDurationSeconds: number;
  allowedOrigin: string;
  expiresAt: Date;
}

export interface DirectUpload {
  uid: string;
  uploadUrl: string;
  expiresAt: Date;
  protocol: 'tus';
}

export interface HistoricalPromotionInput {
  creator: string;
  sourceUrl: string;
  fileName: string;
  allowedOrigin: string;
}

export interface DownloadAsset {
  status: 'inprogress' | 'ready' | 'error';
  url: string | null;
}

export interface StreamGateway {
  createDirectUpload(input: DirectUploadInput): Promise<DirectUpload>;
  promoteHistoricalVideo(input: HistoricalPromotionInput): Promise<string>;
  createPlaybackToken(uid: string, expiresAt: Date): Promise<string>;
  createDownloadToken(uid: string, expiresAt: Date): Promise<string>;
  ensureDownload(uid: string): Promise<DownloadAsset>;
  deleteVideo(uid: string): Promise<void>;
}

export class StreamGatewayError extends Error {}
