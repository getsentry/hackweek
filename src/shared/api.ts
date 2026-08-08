export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_CONFIG_INVALID'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STORAGE_FAILED'
  | 'SERVICE_UNAVAILABLE';

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type UserRole = 'member' | 'admin';
export type SessionViewMode = 'admin' | 'member';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  actualRole: UserRole;
}

export interface SessionResponse {
  user: SessionUser;
}

export interface UpdateSessionViewModeRequest {
  mode: SessionViewMode;
}

export interface UpdateProfileRequest {
  displayName: string;
  avatarUrl: string | null;
}
