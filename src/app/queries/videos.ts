import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import type {
  DirectUploadResponse,
  PlaybackResponse,
  PlaylistResponse,
  ProjectVideo,
  ProjectVideoResponse,
} from '../../shared/videos';
import {apiRequest, jsonRequest} from './api';

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
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      apiRequest<DirectUploadResponse>(
        `/projects/${encodeURIComponent(projectId)}/video/upload`,
        jsonRequest('POST', {fileName: file.name, fileSize: file.size}),
      ),
    onSuccess: ({video}) =>
      cache.setQueryData<ProjectVideoResponse>(
        ['project-video', projectId],
        (current) => ({
          video,
          streamMode: current?.streamMode ?? 'fake',
        }),
      ),
  });
}

export function useDeleteVideo(projectId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>(`/projects/${encodeURIComponent(projectId)}/video`, {
        method: 'DELETE',
      }),
    onSuccess: () =>
      cache.setQueryData<ProjectVideoResponse>(
        ['project-video', projectId],
        (current) => ({
          video: null,
          streamMode: current?.streamMode ?? 'fake',
        }),
      ),
  });
}

export function useRetryVideo(projectId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      apiRequest<{video: ProjectVideo}>(`/videos/${encodeURIComponent(videoId)}/retry`, {
        method: 'POST',
      }),
    onSuccess: ({video}) =>
      cache.setQueryData<ProjectVideoResponse>(
        ['project-video', projectId],
        (current) => ({
          video,
          streamMode: current?.streamMode ?? 'fake',
        }),
      ),
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
