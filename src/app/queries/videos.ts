import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import type {
  DirectUploadResponse,
  PlaybackResponse,
  PlaylistResponse,
  ProjectVideoResponse,
} from '../../shared/videos';
import {clearResumeRecord, persistResumeRecord, readResumeRecord} from '../video/upload';
import {apiRequest, ApiError, jsonRequest} from './api';

export function useProjectVideo(projectId: string) {
  return useQuery({
    queryKey: ['project-video', projectId],
    queryFn: () =>
      apiRequest<ProjectVideoResponse>(
        `/projects/${encodeURIComponent(projectId)}/video`,
      ),
    refetchInterval: ({state}) => {
      const status = state.data?.video?.status;
      return status && !['ready', 'failed'].includes(status) ? 5_000 : false;
    },
  });
}

export function useCreateVideoUpload(projectId: string) {
  return useMutation({
    mutationFn: (file: File) => prepareVideoUpload(projectId, file),
  });
}

async function prepareVideoUpload(projectId: string, file: File) {
  const resume = readResumeRecord(projectId, file);
  if (resume) {
    try {
      const existing = await apiRequest<DirectUploadResponse>(
        `/projects/${encodeURIComponent(projectId)}/video/upload/${encodeURIComponent(resume.uploadId)}`,
      );
      persistResumeRecord(file, existing.upload);
      return existing;
    } catch (error) {
      if (!(error instanceof ApiError) || ![404, 409].includes(error.status)) throw error;
      clearResumeRecord(projectId, file);
    }
  }
  const created = await apiRequest<DirectUploadResponse>(
    `/projects/${encodeURIComponent(projectId)}/video/upload`,
    jsonRequest('POST', {
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || null,
    }),
  );
  persistResumeRecord(file, created.upload);
  return created;
}

export function useRetryVideo(projectId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<ProjectVideoResponse>(
        `/projects/${encodeURIComponent(projectId)}/video/retry`,
        jsonRequest('POST', {}),
      ),
    onSuccess: (response) =>
      cache.setQueryData<ProjectVideoResponse>(['project-video', projectId], response),
  });
}

export function useDeleteVideo(projectId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>(
        `/projects/${encodeURIComponent(projectId)}/video`,
        jsonRequest('DELETE', {confirmed: true}),
      ),
    onSuccess: () =>
      cache.setQueryData<ProjectVideoResponse>(['project-video', projectId], () => ({
        video: null,
      })),
  });
}

export function usePlaylist(yearId: string) {
  return useQuery({
    queryKey: ['video-playlist', yearId],
    queryFn: () =>
      apiRequest<PlaylistResponse>(`/videos/playlist?year=${encodeURIComponent(yearId)}`),
  });
}

export function getPlayback(videoId: string) {
  return apiRequest<PlaybackResponse>(`/videos/${encodeURIComponent(videoId)}/playback`);
}
