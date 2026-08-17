import type {ApiErrorResponse} from '../../shared/api';

export const AUTH_REQUIRED_EVENT = 'hackweek:auth-required';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) throw await apiResponseError(response);
  if (response.status === 204) {
    // SAFETY: API callers use `void` for endpoints whose documented response is 204.
    return undefined as T;
  }
  return response.json();
}

export async function apiResponseError(
  response: Response,
  fallbackMessage = 'The request could not be completed',
) {
  let error: ApiErrorResponse | null = null;
  try {
    error = await response.json();
  } catch {
    // The status remains useful when an upstream response is not JSON.
  }

  if (response.status === 401 && error?.error.code === 'AUTH_REQUIRED') {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }

  return new ApiError(
    response.status,
    error?.error.code ?? 'REQUEST_FAILED',
    error?.error.message ?? fallbackMessage,
  );
}

export function jsonRequest<T>(method: string, body: T): RequestInit {
  return {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  };
}
