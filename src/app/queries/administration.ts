import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import type {
  AdminYearResponse,
  AnalyticsResponse,
  AwardSummary,
  AwardWriteRequest,
  ScreeningOrderItem,
  VoteSummary,
  VoteWriteRequest,
  VotingResponse,
  YearWriteRequest,
} from '../../shared/administration';
import {apiRequest, jsonRequest} from './api';

export function useVoting(yearId: string) {
  return useQuery({
    queryKey: ['voting', yearId],
    queryFn: () =>
      apiRequest<VotingResponse>(`/votes?year=${encodeURIComponent(yearId)}`),
  });
}

export function useVoteMutation(yearId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({voteId, input}: {voteId?: string; input: VoteWriteRequest}) =>
      apiRequest<{vote: VoteSummary}>(
        voteId ? `/votes/${encodeURIComponent(voteId)}` : '/votes',
        jsonRequest(voteId ? 'PUT' : 'POST', input),
      ),
    onSuccess: () => void cache.invalidateQueries({queryKey: ['voting', yearId]}),
  });
}

export function useAdminYear(yearId: string) {
  return useQuery({
    queryKey: ['admin-year', yearId],
    queryFn: () =>
      apiRequest<AdminYearResponse>(`/admin/years/${encodeURIComponent(yearId)}`),
  });
}

export function useAdminMutations(yearId: string) {
  const cache = useQueryClient();
  const refresh = () => {
    void cache.invalidateQueries({queryKey: ['admin-year', yearId]});
    void cache.invalidateQueries({queryKey: ['voting', yearId]});
    void cache.invalidateQueries({queryKey: ['year', yearId]});
    void cache.invalidateQueries({queryKey: ['years']});
  };
  const year = useMutation({
    mutationFn: (input: YearWriteRequest) =>
      apiRequest(`/admin/years/${encodeURIComponent(yearId)}`, jsonRequest('PUT', input)),
    onSuccess: refresh,
  });
  const category = useMutation({
    mutationFn: (input: {id?: string; name: string}) =>
      apiRequest(
        input.id
          ? `/admin/categories/${encodeURIComponent(input.id)}`
          : `/admin/years/${encodeURIComponent(yearId)}/categories`,
        jsonRequest(input.id ? 'PUT' : 'POST', {name: input.name}),
      ),
    onSuccess: refresh,
  });
  const removeCategory = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/admin/categories/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    onSuccess: refresh,
  });
  const nominations = useMutation({
    mutationFn: ({projectId, categoryIds}: {projectId: string; categoryIds: string[]}) =>
      apiRequest(
        `/admin/projects/${encodeURIComponent(projectId)}/nominations`,
        jsonRequest('PUT', {categoryIds}),
      ),
    onSuccess: refresh,
  });
  const award = useMutation({
    mutationFn: ({id, input}: {id?: string; input: AwardWriteRequest}) =>
      apiRequest<{award: AwardSummary}>(
        id
          ? `/admin/awards/${encodeURIComponent(id)}`
          : `/admin/awards/years/${encodeURIComponent(yearId)}`,
        jsonRequest(id ? 'PUT' : 'POST', input),
      ),
    onSuccess: refresh,
  });
  const removeAward = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/admin/awards/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    onSuccess: refresh,
  });
  const screening = useMutation({
    mutationFn: (projectIds: string[]) =>
      apiRequest<{screeningOrder: ScreeningOrderItem[]}>(
        `/admin/years/${encodeURIComponent(yearId)}/screening-order`,
        jsonRequest('PUT', {projectIds}),
      ),
    onSuccess: refresh,
  });
  return {year, category, removeCategory, nominations, award, removeAward, screening};
}

export function useAnalytics(yearId?: string) {
  const query = yearId ? `?year=${encodeURIComponent(yearId)}` : '';
  return useQuery({
    queryKey: ['admin-analytics', yearId],
    queryFn: () => apiRequest<AnalyticsResponse>(`/admin/analytics${query}`),
  });
}

export function useCreateYear() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (yearId: string) =>
      apiRequest(`/admin/years/${encodeURIComponent(yearId)}`, {method: 'POST'}),
    onSuccess: () => {
      void cache.invalidateQueries({queryKey: ['years']});
      void cache.invalidateQueries({queryKey: ['admin-analytics']});
    },
  });
}
