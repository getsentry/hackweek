import type {ApiErrorCode, ApiErrorResponse} from '../../shared/api';

export class ServiceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 503,
  ) {
    super(message);
  }
}

export function errorResponse(cause: unknown) {
  if (cause instanceof ServiceError) {
    const response: ApiErrorResponse = {
      error: {code: cause.code, message: cause.message},
    };
    return {response, status: cause.status} as const;
  }

  if (cause instanceof SyntaxError) {
    const response: ApiErrorResponse = {
      error: {code: 'VALIDATION_FAILED', message: 'Request body must be valid JSON'},
    };
    return {response, status: 400} as const;
  }

  throw cause;
}
