import type {UpdateProfileRequest} from './api';
import {isJsonObject, isJsonString, type JsonInput} from './json';

export class ProfileValidationError extends Error {}

export function parseUpdateProfile(value: JsonInput): UpdateProfileRequest {
  if (!isJsonObject(value)) {
    throw new ProfileValidationError('Profile must be a JSON object');
  }

  if (!isJsonString(value.displayName)) {
    throw new ProfileValidationError('Display name is required');
  }

  const displayName = value.displayName.trim();
  if (displayName.length < 1 || displayName.length > 100) {
    throw new ProfileValidationError('Display name must be between 1 and 100 characters');
  }

  if (value.avatarUrl !== null && !isJsonString(value.avatarUrl)) {
    throw new ProfileValidationError('Avatar URL must be a URL or null');
  }

  let avatarUrl: string | null = null;
  if (isJsonString(value.avatarUrl) && value.avatarUrl.length > 0) {
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
