import {Upload} from 'tus-js-client';

export type UploadPhase = 'uploading' | 'paused' | 'interrupted' | 'complete';

export interface UploadSnapshot {
  phase: UploadPhase;
  bytesSent: number;
  bytesTotal: number;
  error: string | null;
}

export interface ResumableUpload {
  start(): void;
  pause(): Promise<void>;
  resume(): void;
  retry(): void;
}

export function createTusUpload(
  file: File,
  uploadUrl: string,
  chunkSize: number,
  onChange: (snapshot: UploadSnapshot) => void,
): ResumableUpload {
  let phase: UploadPhase = 'uploading';
  let bytesSent = 0;
  let error: string | null = null;
  const notify = () => onChange({phase, bytesSent, bytesTotal: file.size, error});
  const upload = new Upload(file, {
    uploadUrl,
    chunkSize,
    retryDelays: [0, 1_000, 3_000, 5_000],
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    metadata: {filename: file.name, filetype: file.type || 'application/octet-stream'},
    onProgress(sent) {
      bytesSent = sent;
      phase = 'uploading';
      error = null;
      notify();
    },
    onError(uploadError) {
      phase = 'interrupted';
      error = uploadError.message;
      notify();
    },
    onSuccess() {
      bytesSent = file.size;
      phase = 'complete';
      error = null;
      notify();
    },
  });

  return {
    start() {
      phase = 'uploading';
      error = null;
      notify();
      upload.start();
    },
    async pause() {
      await upload.abort();
      phase = 'paused';
      notify();
    },
    resume() {
      phase = 'uploading';
      error = null;
      notify();
      upload.start();
    },
    retry() {
      phase = 'uploading';
      error = null;
      notify();
      upload.start();
    },
  };
}
