import type {ApiErrorCode, ApiErrorResponse} from '../../shared/api';

export class ServiceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ServiceError) {
    const response: ApiErrorResponse = {
      error: {code: error.code, message: error.message},
    };
    return {response, status: error.status} as const;
  }

  if (error instanceof SyntaxError) {
    const response: ApiErrorResponse = {
      error: {code: 'VALIDATION_FAILED', message: 'Request body must be valid JSON'},
    };
    return {response, status: 400} as const;
  }

  throw error;
}
