import {useRef, useState, type ChangeEvent} from 'react';
import {Link} from 'wouter';

import type {ProjectVideo} from '../../shared/videos';
import {useCreateVideoUpload, useDeleteVideo, useRetryVideo} from '../queries/videos';
import {createTusUpload, type ResumableUpload, type UploadSnapshot} from './upload';

const INITIAL_UPLOAD: UploadSnapshot = {
  phase: 'uploading',
  bytesSent: 0,
  bytesTotal: 0,
  error: null,
};

export function ProjectVideoPanel({
  projectId,
  yearId,
  video,
  canManage,
  loading = false,
  uploadFactory = createTusUpload,
}: {
  projectId: string;
  yearId: string;
  video: ProjectVideo | null;
  canManage: boolean;
  loading?: boolean;
  uploadFactory?: typeof createTusUpload;
}) {
  const createUpload = useCreateVideoUpload(projectId);
  const remove = useDeleteVideo(projectId);
  const retry = useRetryVideo(projectId);
  const controller = useRef<ResumableUpload | null>(null);
  const [upload, setUpload] = useState<UploadSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUpload({...INITIAL_UPLOAD, bytesTotal: file.size});
    createUpload.mutate(file, {
      onSuccess: (result) => {
        const next = uploadFactory(
          file,
          result.upload.url,
          result.upload.chunkSize,
          setUpload,
        );
        controller.current = next;
        next.start();
      },
      onError: (uploadError) => {
        setUpload(null);
        setError(uploadError.message);
      },
    });
  }

  const isUploading = upload && upload.phase !== 'complete';
  const actionError = error ?? remove.error?.message ?? retry.error?.message;

  return (
    <section className="videoPanel" aria-labelledby="project-video-heading">
      <header>
        <div>
          <p className="kicker">demo reel</p>
          <h2 id="project-video-heading">project video</h2>
        </div>
        {video?.status === 'ready' && (
          <Link
            className="primaryAction"
            href={`/years/${yearId}/projects/${projectId}/video`}
          >
            watch video
          </Link>
        )}
      </header>

      {loading ? (
        <p className="videoNotice" aria-live="polite">
          loading video status…
        </p>
      ) : video ? (
        <VideoStatusCard video={video} />
      ) : (
        <p className="videoNotice">
          no demo video yet. projects remain complete without one.
        </p>
      )}

      {upload && (
        <div className="uploadProgress" aria-live="polite">
          <div>
            <strong>{uploadLabel(upload.phase)}</strong>
            <span>{Math.round(progress(upload) * 100)}%</span>
          </div>
          <progress value={upload.bytesSent} max={upload.bytesTotal || 1}>
            {Math.round(progress(upload) * 100)}%
          </progress>
          {upload.error && <p role="alert">{upload.error}</p>}
          <div className="videoActions">
            {upload.phase === 'uploading' && (
              <button
                className="textAction"
                onClick={() => void controller.current?.pause()}
              >
                pause upload
              </button>
            )}
            {upload.phase === 'paused' && (
              <button
                className="primaryAction"
                onClick={() => controller.current?.resume()}
              >
                resume upload
              </button>
            )}
            {upload.phase === 'interrupted' && (
              <button
                className="primaryAction"
                onClick={() => controller.current?.retry()}
              >
                retry upload
              </button>
            )}
          </div>
        </div>
      )}

      {canManage && !isUploading && (
        <div className="videoActions">
          {(!video || video.status === 'failed') && (
            <label className="uploadAction">
              {video ? 'choose replacement' : 'select video'}
              <input
                aria-label={video ? 'choose replacement video' : 'select project video'}
                type="file"
                accept="video/*"
                disabled={createUpload.isPending}
                onChange={selectFile}
              />
            </label>
          )}
          {video?.status === 'failed' && video.failureStage === 'measurement' && (
            <button
              className="textAction"
              disabled={retry.isPending}
              onClick={() => retry.mutate(video.id)}
            >
              retry measurement
            </button>
          )}
          {video && (
            <button
              className="dangerAction"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('delete this primary video and its Stream copy?'))
                  remove.mutate();
              }}
            >
              delete video
            </button>
          )}
        </div>
      )}
      {actionError && (
        <p className="formError" role="alert">
          {actionError}
        </p>
      )}
      <p className="videoFinePrint">
        uploads go directly to Cloudflare Stream using resumable tus. closing this page
        does not send video bytes through Hackweek.
      </p>
    </section>
  );
}

function VideoStatusCard({video}: {video: ProjectVideo}) {
  const labels: Record<ProjectVideo['status'], string> = {
    pending_upload: 'waiting for upload',
    uploading: 'uploading to Stream',
    processing: 'processing video',
    measuring: 'measuring audio',
    ready: 'ready to watch',
    failed: 'needs attention',
  };
  return (
    <div className={`videoStatus videoStatus--${video.status}`}>
      <span className="statusDot" aria-hidden="true" />
      <div>
        <strong>{labels[video.status]}</strong>
        <p>
          {video.status === 'ready'
            ? `${formatDuration(video.durationSeconds)} · audio normalized`
            : video.errorMessage || statusDetail(video.status)}
        </p>
      </div>
    </div>
  );
}

function statusDetail(status: ProjectVideo['status']) {
  if (status === 'uploading')
    return 'the resumable upload can continue after an interruption.';
  if (status === 'processing') return 'Stream is preparing protected playback.';
  if (status === 'measuring') return 'loudness is being measured before screening.';
  return 'this video is not included in the screening playlist.';
}

function uploadLabel(phase: UploadSnapshot['phase']) {
  return {
    uploading: 'uploading directly to Stream',
    paused: 'upload paused',
    interrupted: 'upload interrupted',
    complete: 'upload complete — processing next',
  }[phase];
}

function progress(upload: UploadSnapshot) {
  return upload.bytesTotal ? upload.bytesSent / upload.bytesTotal : 0;
}

function formatDuration(value: number | null) {
  if (value === null) return 'duration unavailable';
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
}
