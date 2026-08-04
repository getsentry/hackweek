import type {
  AwardWriteRequest,
  NamedWriteRequest,
  NominationsWriteRequest,
  ScreeningOrderWriteRequest,
  VoteWriteRequest,
  YearWriteRequest,
} from '../../shared/administration';
import {ServiceError} from './errors';

export function parseVote(value: unknown): VoteWriteRequest {
  const body = record(value);
  return {
    yearId: identifier(body.yearId, 'Year'),
    projectId: identifier(body.projectId, 'Project'),
    categoryId: identifier(body.categoryId, 'Category'),
  };
}

export function parseYear(value: unknown): YearWriteRequest {
  const body = record(value);
  if (
    typeof body.votingEnabled !== 'boolean' ||
    typeof body.submissionsClosed !== 'boolean'
  ) {
    invalid('Year flags must be booleans');
  }
  return {
    votingEnabled: body.votingEnabled as boolean,
    submissionsClosed: body.submissionsClosed as boolean,
  };
}

export function parseNamed(value: unknown): NamedWriteRequest {
  const body = record(value);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) invalid('Name must be between 1 and 120 characters');
  return {name};
}

export function parseAward(value: unknown): AwardWriteRequest {
  const body = record(value);
  return {
    ...parseNamed(body),
    projectId: identifier(body.projectId, 'Project'),
    categoryId: identifier(body.categoryId, 'Category'),
  };
}

export function parseNominations(value: unknown): NominationsWriteRequest {
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

export function parseScreeningOrder(value: unknown): ScreeningOrderWriteRequest {
  const body = record(value);
  if (!Array.isArray(body.projectIds)) invalid('Project order must be an array');
  const projectIds = body.projectIds.map((value) => identifier(value, 'Project'));
  if (new Set(projectIds).size !== projectIds.length) {
    invalid('Screening projects must be distinct');
  }
  return {projectIds};
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    invalid(`${label} identifier is invalid`);
  }
  return value as string;
}

function invalid(message: string): never {
  throw new ServiceError('VALIDATION_FAILED', message, 400);
}
