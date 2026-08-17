import {
  isJsonNumber,
  isJsonObject,
  isJsonString,
  type JsonInput,
} from '../../shared/json';
import type {VideoUploadPart, VideoUploadSession} from '../../shared/videos';
import {apiResponseError} from '../queries/api';

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

interface ResumeRecord {
  projectId: string;
  uploadId: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  completedParts: VideoUploadPart[];
}

function parseResumeRecord(value: JsonInput): ResumeRecord {
  if (
    !isJsonObject(value) ||
    !isJsonString(value.projectId) ||
    !isJsonString(value.uploadId) ||
    !isJsonString(value.fileName) ||
    !isJsonNumber(value.fileSize) ||
    !isJsonNumber(value.lastModified) ||
    !Array.isArray(value.completedParts)
  ) {
    throw new Error('Invalid resumable upload record');
  }
  const completedParts = value.completedParts.map((part) => {
    if (
      !isJsonObject(part) ||
      !isJsonNumber(part.partNumber) ||
      !isJsonString(part.etag) ||
      !isJsonNumber(part.sizeBytes)
    ) {
      throw new Error('Invalid resumable upload part');
    }
    return {partNumber: part.partNumber, etag: part.etag, sizeBytes: part.sizeBytes};
  });
  return {
    projectId: value.projectId,
    uploadId: value.uploadId,
    fileName: value.fileName,
    fileSize: value.fileSize,
    lastModified: value.lastModified,
    completedParts,
  };
}

export function createMultipartUpload(
  file: File,
  session: VideoUploadSession,
  onChange: (snapshot: UploadSnapshot) => void,
): ResumableUpload {
  let phase: UploadPhase = 'uploading';
  let parts = [...session.completedParts].sort(
    (left, right) => left.partNumber - right.partNumber,
  );
  let active: AbortController | null = null;
  let running = false;
  let error: string | null = null;
  const bytesSent = () => parts.reduce((total, part) => total + part.sizeBytes, 0);
  const notify = () =>
    onChange({phase, bytesSent: bytesSent(), bytesTotal: file.size, error});
  const isPaused = () => phase === 'paused';

  async function run() {
    if (running || phase === 'complete') return;
    running = true;
    phase = 'uploading';
    error = null;
    notify();
    try {
      const partCount = Math.ceil(file.size / session.partSize);
      for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
        if (isPaused()) return;
        if (parts.some((part) => part.partNumber === partNumber)) continue;
        active = new AbortController();
        const start = (partNumber - 1) * session.partSize;
        const body = file.slice(start, Math.min(file.size, start + session.partSize));
        const response = await fetch(partUrl(session, partNumber), {
          method: 'PUT',
          headers: {'Content-Type': 'application/octet-stream'},
          body,
          signal: active.signal,
        });
        if (!response.ok) {
          throw await apiResponseError(response, `Upload failed (${response.status})`);
        }
        const result: {part: VideoUploadPart} = await response.json();
        parts = [...parts, result.part].sort(
          (left, right) => left.partNumber - right.partNumber,
        );
        persistResumeRecord(file, session, parts);
        notify();
      }

      if (isPaused()) return;
      const completed = await fetch(`${uploadUrl(session)}/complete`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          parts: parts.map(({partNumber, etag}) => ({partNumber, etag})),
        }),
      });
      if (!completed.ok) {
        throw await apiResponseError(completed, `Upload failed (${completed.status})`);
      }
      clearResumeRecord(session.projectId, file);
      phase = 'complete';
      error = null;
      notify();
    } catch (uploadError) {
      if (!active?.signal.aborted) {
        phase = 'interrupted';
        error = uploadError instanceof Error ? uploadError.message : 'Upload interrupted';
        notify();
      }
    } finally {
      active = null;
      running = false;
    }
  }

  return {
    start() {
      void run();
    },
    async pause() {
      phase = 'paused';
      active?.abort();
      notify();
    },
    resume() {
      void run();
    },
    retry() {
      void run();
    },
  };
}

export function resumeStorageKey(projectId: string, file: File) {
  return `hackweek:video-upload:${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

export function readResumeRecord(projectId: string, file: File) {
  if (!('localStorage' in globalThis)) return null;
  const value = localStorage.getItem(resumeStorageKey(projectId, file));
  if (!value) return null;
  try {
    const record = parseResumeRecord(JSON.parse(value));
    if (
      record.projectId !== projectId ||
      record.fileName !== file.name ||
      record.fileSize !== file.size ||
      record.lastModified !== file.lastModified ||
      !record.uploadId
    ) {
      clearResumeRecord(projectId, file);
      return null;
    }
    return record;
  } catch {
    clearResumeRecord(projectId, file);
    return null;
  }
}

export function persistResumeRecord(
  file: File,
  session: VideoUploadSession,
  completedParts = session.completedParts,
) {
  if (!('localStorage' in globalThis)) return;
  const record: ResumeRecord = {
    projectId: session.projectId,
    uploadId: session.uploadId,
    fileName: file.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    completedParts,
  };
  localStorage.setItem(resumeStorageKey(session.projectId, file), JSON.stringify(record));
}

export function clearResumeRecord(projectId: string, file: File) {
  if (!('localStorage' in globalThis)) return;
  localStorage.removeItem(resumeStorageKey(projectId, file));
}

function uploadUrl(session: VideoUploadSession) {
  return `/api/projects/${encodeURIComponent(session.projectId)}/video/upload/${encodeURIComponent(session.uploadId)}`;
}

function partUrl(session: VideoUploadSession, partNumber: number) {
  return `${uploadUrl(session)}/parts/${partNumber}`;
}
