import type {UpdateProfileRequest} from './api';

export class ProfileValidationError extends Error {}

export function parseUpdateProfile(value: unknown): UpdateProfileRequest {
  if (!isObject(value)) {
    throw new ProfileValidationError('Profile must be a JSON object');
  }

  if (typeof value.displayName !== 'string') {
    throw new ProfileValidationError('Display name is required');
  }

  const displayName = value.displayName.trim();
  if (displayName.length < 1 || displayName.length > 100) {
    throw new ProfileValidationError('Display name must be between 1 and 100 characters');
  }

  if (value.avatarUrl !== null && typeof value.avatarUrl !== 'string') {
    throw new ProfileValidationError('Avatar URL must be a URL or null');
  }

  let avatarUrl: string | null = null;
  if (typeof value.avatarUrl === 'string' && value.avatarUrl.length > 0) {
    if (value.avatarUrl.length > 2048) {
      throw new ProfileValidationError('Avatar URL is too long');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value.avatarUrl);
    } catch {
      throw new ProfileValidationError('Avatar URL must be a valid HTTPS URL');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new ProfileValidationError('Avatar URL must be a valid HTTPS URL');
    }
    avatarUrl = parsedUrl.toString();
  }

  return {displayName, avatarUrl};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
