import {useRef, useState, type ChangeEvent, type DragEvent} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Link} from 'wouter';

import type {PlaybackResponse, ProjectVideo} from '../../shared/videos';
import {IndividualPlayer} from '../player/IndividualPlayer';
import {useCreateVideoUpload, useDeleteVideo, useRetryVideo} from '../queries/videos';
import {createMultipartUpload, type ResumableUpload, type UploadSnapshot} from './upload';

const INITIAL_UPLOAD: UploadSnapshot = {
  phase: 'uploading',
  bytesSent: 0,
  bytesTotal: 0,
  error: null,
};

type UploadFactory = typeof createMultipartUpload;

export function ProjectVideoPanel(props: {
  projectId: string;
  yearId: string;
  video: ProjectVideo | null;
  canManage: boolean;
  loading?: boolean;
  playback?: PlaybackResponse;
  playbackError?: string;
  uploadFactory?: UploadFactory;
}) {
  const {
    projectId,
    yearId,
    video,
    canManage,
    loading = false,
    playback,
    playbackError,
    uploadFactory = createMultipartUpload,
  } = props;
  const cache = useQueryClient();
  const createUpload = useCreateVideoUpload(projectId);
  const retryProcessing = useRetryVideo(projectId);
  const remove = useDeleteVideo(projectId);
  const controller = useRef<ResumableUpload | null>(null);
  const [upload, setUpload] = useState<UploadSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  function beginUpload(file: File) {
    setError(null);
    setUpload({...INITIAL_UPLOAD, bytesTotal: file.size});
    createUpload.mutate(file, {
      onSuccess: (result) => {
        const next = uploadFactory(file, result.upload, (snapshot) => {
          setUpload(snapshot);
          if (snapshot.phase === 'complete') {
            void cache.invalidateQueries({queryKey: ['project-video', projectId]});
          }
        });
        controller.current = next;
        next.start();
      },
      onError: (uploadError) => {
        setUpload(null);
        setError(uploadError.message);
      },
    });
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) beginUpload(file);
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) beginUpload(file);
  }

  const isUploading = upload && upload.phase !== 'complete';
  const actionError = error ?? retryProcessing.error?.message ?? remove.error?.message;

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

      {video?.status === 'ready' && playback && (
        <IndividualPlayer playback={playback} title="project demo" />
      )}
      {playbackError && (
        <p className="formError" role="alert">
          {playbackError}
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
          {!video && (
            <label
              className="uploadAction"
              onDragOver={(event) => event.preventDefault()}
              onDrop={dropFile}
            >
              drop or select video
              <input
                aria-label="select project video"
                type="file"
                accept="video/*"
                disabled={createUpload.isPending}
                onChange={selectFile}
              />
            </label>
          )}
          {video?.status === 'failed' && (
            <button
              className="primaryAction"
              disabled={retryProcessing.isPending}
              onClick={() => retryProcessing.mutate()}
            >
              retry processing
            </button>
          )}
          {video && (
            <button
              className="dangerAction"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Retire this video? Its original and processed files will be retained.',
                  )
                )
                  remove.mutate();
              }}
            >
              retire video
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
        uploads are sent in resumable parts to private R2 storage. completed originals are
        retained when a video is retired.
      </p>
    </section>
  );
}

function VideoStatusCard({video}: {video: ProjectVideo}) {
  const labels: Record<ProjectVideo['status'], string> = {
    queued: 'queued for processing',
    processing: 'processing video',
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
  if (status === 'queued') return 'the immutable original is ready for processing.';
  if (status === 'processing') return 'the uploaded video is being normalized.';
  return 'this video is not included in the screening playlist.';
}

function uploadLabel(phase: UploadSnapshot['phase']) {
  return {
    uploading: 'uploading to private storage',
    paused: 'upload paused',
    interrupted: 'upload interrupted',
    complete: 'upload complete — processing queued',
  }[phase];
}

function progress(upload: UploadSnapshot) {
  return upload.bytesTotal ? upload.bytesSent / upload.bytesTotal : 0;
}

function formatDuration(value: number | null) {
  if (value === null) return 'duration unavailable';
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
}
