import type {ApiErrorResponse} from '../../shared/api';

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
  if (!response.ok) {
    let error: ApiErrorResponse | null = null;
    try {
      error = await response.json();
    } catch {
      // The status remains useful when an upstream response is not JSON.
    }
    throw new ApiError(
      response.status,
      error?.error.code ?? 'REQUEST_FAILED',
      error?.error.message ?? 'The request could not be completed',
    );
  }
  if (response.status === 204) {
    // SAFETY: API callers use `void` for endpoints whose documented response is 204.
    return undefined as T;
  }
  return response.json();
}

export function jsonRequest<T>(method: string, body: T): RequestInit {
  return {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  };
}
