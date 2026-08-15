import type {
  AwardWriteRequest,
  NamedWriteRequest,
  NominationsWriteRequest,
  ScreeningOrderWriteRequest,
  VoteWriteRequest,
  YearWriteRequest,
} from '../../shared/administration';
import {
  isJsonBoolean,
  isJsonObject,
  isJsonString,
  type JsonInput,
  type JsonObject,
} from '../../shared/json';
import {ServiceError} from './errors';

export function parseVote(value: JsonInput): VoteWriteRequest {
  const body = record(value);
  return {
    yearId: identifier(body.yearId, 'Year'),
    projectId: identifier(body.projectId, 'Project'),
    categoryId: identifier(body.categoryId, 'Category'),
  };
}

export function parseYear(value: JsonInput): YearWriteRequest {
  const body = record(value);
  if (!isJsonBoolean(body.votingEnabled) || !isJsonBoolean(body.submissionsClosed)) {
    invalid('Year flags must be booleans');
  }
  return {
    votingEnabled: body.votingEnabled,
    submissionsClosed: body.submissionsClosed,
  };
}

export function parseNamed(value: JsonInput): NamedWriteRequest {
  const body = record(value);
  const name = isJsonString(body.name) ? body.name.trim() : '';
  if (!name || name.length > 120) invalid('Name must be between 1 and 120 characters');
  return {name};
}

export function parseAward(value: JsonInput): AwardWriteRequest {
  const body = record(value);
  return {
    ...parseNamed(body),
    projectId: identifier(body.projectId, 'Project'),
    categoryId: identifier(body.categoryId, 'Category'),
  };
}

export function parseNominations(value: JsonInput): NominationsWriteRequest {
  const body = record(value);
  if (!Array.isArray(body.categoryIds) || body.categoryIds.length > 2) {
    invalid('A project can have at most two nominations');
  }
  const categoryIds = body.categoryIds.map((value) => identifier(value, 'Category'));
  if (new Set(categoryIds).size !== categoryIds.length) {
    invalid('Nomination categories must be distinct');
  }
  return {categoryIds};
}

export function parseScreeningOrder(value: JsonInput): ScreeningOrderWriteRequest {
  const body = record(value);
  if (!Array.isArray(body.projectIds)) invalid('Project order must be an array');
  const projectIds = body.projectIds.map((value) => identifier(value, 'Project'));
  if (new Set(projectIds).size !== projectIds.length) {
    invalid('Screening projects must be distinct');
  }
  return {projectIds};
}

function record(value: JsonInput): JsonObject {
  if (!isJsonObject(value)) {
    invalid('Request body must be an object');
  }
  return value;
}

function identifier(value: JsonInput, label: string) {
  if (!isJsonString(value) || !value.trim() || value.length > 128) {
    invalid(`${label} identifier is invalid`);
  }
  return value;
}

function invalid(message: string): never {
  throw new ServiceError('VALIDATION_FAILED', message, 400);
}
