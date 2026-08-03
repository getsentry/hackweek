export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_CONFIG_INVALID'
  | 'VALIDATION_FAILED';

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type UserRole = 'member' | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
}

export interface SessionResponse {
  user: SessionUser;
}

export interface UpdateProfileRequest {
  displayName: string;
  avatarUrl: string | null;
}
