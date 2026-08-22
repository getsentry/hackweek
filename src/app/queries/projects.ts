import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  GroupResponse,
  GroupWriteRequest,
  MediaResponse,
  ProjectOptionsResponse,
  ProjectResponse,
  ProjectsResponse,
  ProjectWriteRequest,
  YearResponse,
  YearsResponse,
} from '../../shared/projects';
import {apiRequest, jsonRequest} from './api';

export function useYears() {
  return useQuery({
    queryKey: ['years'],
    queryFn: () => apiRequest<YearsResponse>('/years'),
  });
}

export function useYear(yearId: string) {
  return useQuery({
    queryKey: ['year', yearId],
    queryFn: () => apiRequest<YearResponse>(`/years/${encodeURIComponent(yearId)}`),
  });
}

export const PROJECTS_PAGE_SIZE = 250;

export function useProjects(
  yearId: string,
  kind?: 'project' | 'idea',
  group?: string,
  search?: string,
  hasVideo?: boolean,
  cursor?: string,
) {
  const query = new URLSearchParams({
    year: yearId,
    limit: String(PROJECTS_PAGE_SIZE),
  });
  if (kind) query.set('kind', kind);
  if (group) query.set('group', group);
  if (search) query.set('q', search);
  if (hasVideo) query.set('hasVideo', 'true');
  if (cursor) query.set('cursor', cursor);
  return useQuery({
    queryKey: ['projects', yearId, kind, group, search, hasVideo, cursor ?? null],
    queryFn: () => apiRequest<ProjectsResponse>(`/projects?${query}`),
    placeholderData: keepPreviousData,
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      apiRequest<ProjectResponse>(`/projects/${encodeURIComponent(projectId)}`),
  });
}

export function useGroupMutations(yearId: string) {
  const cache = useQueryClient();
  const refresh = () => {
    void cache.invalidateQueries({queryKey: ['year', yearId]});
    void cache.invalidateQueries({queryKey: ['project-options', yearId]});
    void cache.invalidateQueries({queryKey: ['projects', yearId]});
  };
  const create = useMutation({
    mutationFn: (input: GroupWriteRequest) =>
      apiRequest<GroupResponse>(
        `/years/${encodeURIComponent(yearId)}/groups`,
        jsonRequest('POST', input),
      ),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({id, name}: {id: string; name: string}) =>
      apiRequest<GroupResponse>(
        `/groups/${encodeURIComponent(id)}`,
        jsonRequest('PUT', {name}),
      ),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/groups/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    onSuccess: refresh,
  });
  return {create, update, remove};
}

export function useProjectOptions(yearId: string) {
  return useQuery({
    queryKey: ['project-options', yearId],
    queryFn: () =>
      apiRequest<ProjectOptionsResponse>(`/years/${encodeURIComponent(yearId)}/options`),
  });
}

export function useSaveProject(projectId?: string, claim = false) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectWriteRequest) => {
      const path = projectId
        ? `/projects/${encodeURIComponent(projectId)}${claim ? '/claim' : ''}`
        : '/projects';
      return apiRequest<ProjectResponse>(
        path,
        jsonRequest(projectId ? (claim ? 'POST' : 'PUT') : 'POST', input),
      );
    },
    onSuccess: ({project}) => {
      cache.setQueryData(['project', project.id], {project});
      void cache.invalidateQueries({queryKey: ['projects', project.yearId]});
      void cache.invalidateQueries({queryKey: ['year', project.yearId]});
      void cache.invalidateQueries({queryKey: ['years']});
    },
  });
}

export function useDeleteProject() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiRequest<void>(`/projects/${encodeURIComponent(projectId)}`, {method: 'DELETE'}),
    onSuccess: () => {
      void cache.invalidateQueries({queryKey: ['projects']});
      void cache.invalidateQueries({queryKey: ['year']});
    },
  });
}

export function useUploadMedia(projectId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set('file', file);
      return apiRequest<MediaResponse>(
        `/media/projects/${encodeURIComponent(projectId)}`,
        {method: 'POST', body},
      );
    },
    onSuccess: () => void cache.invalidateQueries({queryKey: ['project', projectId]}),
  });
}

export function useDeleteMedia(projectId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) =>
      apiRequest<void>(`/media/${encodeURIComponent(mediaId)}`, {method: 'DELETE'}),
    onSuccess: () => void cache.invalidateQueries({queryKey: ['project', projectId]}),
  });
}
