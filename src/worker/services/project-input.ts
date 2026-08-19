import {
  isJsonBoolean,
  isJsonObject,
  isJsonString,
  type JsonInput,
} from '../../shared/json';
import type {GroupWriteRequest, ProjectWriteRequest} from '../../shared/projects';
import {ServiceError} from './errors';

const MAX_MEMBERS = 50;
const MAX_NOMINATIONS = 2;

export function parseProjectWrite(value: JsonInput): ProjectWriteRequest {
  if (!isJsonObject(value)) {
    invalid('Project must be a JSON object');
  }

  const yearId = requiredText(value.yearId, 'Year', 20);
  const name = requiredText(value.name, 'Project name', 120);
  const summary = requiredText(value.summary, 'Summary', 10_000);
  const repository = optionalText(value.repository, 'Repository', 2_048);
  const kind = value.kind;
  if (kind !== 'project' && kind !== 'idea') {
    invalid('Project kind must be project or idea');
  }
  const groupId = optionalId(value.groupId, 'Group');
  const needsHelp = booleanValue(value.needsHelp, 'Needs help');
  const helpDetails = optionalText(value.helpDetails, 'Help details', 5_000);

  if (!Array.isArray(value.memberIds)) {
    invalid('Team members must be an array');
  }
  const memberIds = [
    ...new Set(value.memberIds.map((id) => requiredText(id, 'Member', 128))),
  ];
  if (memberIds.length > MAX_MEMBERS) {
    invalid(`A project may have at most ${MAX_MEMBERS} members`);
  }

  if (!Array.isArray(value.nominationCategoryIds)) {
    invalid('Award nominations must be an array');
  }
  const nominationCategoryIds = value.nominationCategoryIds.map((id) =>
    requiredText(id, 'Award category', 128),
  );
  if (new Set(nominationCategoryIds).size !== nominationCategoryIds.length) {
    invalid('Award nominations must be distinct');
  }
  if (nominationCategoryIds.length > MAX_NOMINATIONS) {
    invalid(`A project may nominate at most ${MAX_NOMINATIONS} award categories`);
  }

  if (kind === 'idea') {
    if (
      groupId ||
      memberIds.length ||
      nominationCategoryIds.length ||
      needsHelp ||
      helpDetails
    ) {
      invalid(
        'Ideas cannot have a group, team, award nominations, or help request until claimed',
      );
    }
  } else if (!groupId) {
    invalid('Projects must belong to a group');
  }

  return {
    yearId,
    name,
    summary,
    repository: kind === 'idea' ? null : repository,
    kind,
    groupId: kind === 'idea' ? null : groupId,
    memberIds: kind === 'idea' ? [] : memberIds,
    nominationCategoryIds: kind === 'idea' ? [] : nominationCategoryIds,
    needsHelp: kind === 'project' && needsHelp,
    helpDetails: kind === 'project' && needsHelp ? helpDetails : null,
  };
}

export function parseGroupWrite(value: JsonInput): GroupWriteRequest {
  if (!isJsonObject(value)) {
    invalid('Group must be a JSON object');
  }
  return {name: requiredText(value.name, 'Group name', 100)};
}

function requiredText(value: JsonInput, label: string, max: number) {
  if (!isJsonString(value)) {
    invalid(`${label} is required`);
  }
  const result = value.trim();
  if (!result || result.length > max) {
    invalid(`${label} must be between 1 and ${max} characters`);
  }
  return result;
}

function optionalText(value: JsonInput, label: string, max: number) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (!isJsonString(value) || value.trim().length > max) {
    invalid(`${label} must be at most ${max} characters`);
  }
  return value.trim() || null;
}

function optionalId(value: JsonInput, label: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return requiredText(value, label, 128);
}

function booleanValue(value: JsonInput, label: string) {
  if (!isJsonBoolean(value)) {
    invalid(`${label} must be a boolean`);
  }
  return value;
}

function invalid(message: string): never {
  throw new ServiceError('VALIDATION_FAILED', message, 400);
}
