import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import type {
  AdminYearResponse,
  AnalyticsResponse,
  AwardSummary,
  AwardWriteRequest,
  BallotStatusResponse,
  ScreeningOrderItem,
  VoteSummary,
  VoteWriteRequest,
  YearWriteRequest,
} from '../../shared/administration';
import {apiRequest, jsonRequest} from './api';

const ballotStatusQueryKey = (yearId: string) => ['ballot-status', yearId] as const;

export function useBallotStatus(yearId: string, enabled = true) {
  return useQuery({
    queryKey: ballotStatusQueryKey(yearId),
    queryFn: () =>
      apiRequest<BallotStatusResponse>(`/votes?year=${encodeURIComponent(yearId)}`),
    enabled,
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
    onSettled: () => cache.invalidateQueries({queryKey: ballotStatusQueryKey(yearId)}),
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
    void cache.invalidateQueries({queryKey: ballotStatusQueryKey(yearId)});
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
  return {year, category, removeCategory, award, removeAward, screening};
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
