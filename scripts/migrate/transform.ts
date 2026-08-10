import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {
  entityNames,
  type EntityName,
  type MigrationData,
  type MigrationIssue,
  type StorageManifestEntry,
} from './types';

type JsonObject = Record<string, unknown>;

export interface TransformResult {
  data: MigrationData;
  issues: MigrationIssue[];
  sourceCounts: Record<EntityName, number>;
  storageObjects: Array<{
    sourcePath: string;
    destinationKey: string | null;
    size: number | null;
    sha256: string | null;
    status: string;
    projectId: string | null;
    mediaId: string | null;
  }>;
}

export async function transformFirebaseExport(
  value: unknown,
  manifest: StorageManifestEntry[] = [],
  storageRoot?: string,
): Promise<TransformResult> {
  const root = object(value);
  if (!root) throw new Error('Firebase export root must be a JSON object');
  const data = emptyData();
  const issues: MigrationIssue[] = [];
  reportUnknownKeys(root, new Set(['users', 'years']), '', issues);
  const sourceCounts = Object.fromEntries(entityNames.map((name) => [name, 0])) as Record<
    EntityName,
    number
  >;
  const manifestByPath = new Map<string, StorageManifestEntry>();
  for (const [index, entry] of manifest.entries()) {
    const sourcePath = normalizeSourcePath(entry.path);
    if (!sourcePath || sourcePath !== entry.path) {
      issue(
        issues,
        'error',
        'INVALID_STORAGE_PATH',
        `storageManifest/${index}/path`,
        entry.path,
      );
      continue;
    }
    if (manifestByPath.has(sourcePath)) {
      issue(
        issues,
        'error',
        'DUPLICATE_STORAGE_PATH',
        `storageManifest/${index}`,
        sourcePath,
      );
      continue;
    }
    manifestByPath.set(sourcePath, entry);
  }

  const users = entries(root.users, 'users', issues);
  sourceCounts.users = users.length;
  const knownUsers = new Set<string>();
  for (const [uid, raw] of users) {
    const user = object(raw);
    const at = `users/${uid}`;
    if (!user) {
      issue(issues, 'error', 'INVALID_RECORD', at, 'expected an object');
      continue;
    }
    const email = text(user.email);
    const displayName = text(user.displayName);
    if (!email || !displayName) {
      issue(issues, 'error', 'INVALID_RECORD', at, 'email and displayName are required');
      continue;
    }
    knownUsers.add(uid);
    data.users.push({
      id: uid,
      sourceUid: uid,
      email,
      displayName,
      avatarUrl: text(user.avatarUrl),
      isAdmin: user.admin === true,
      createdAt: timestamp(null),
    });
  }

  const years = entries(root.years, 'years', issues);
  sourceCounts.years = years.length;
  for (const [yearId, rawYear] of years) {
    const year = object(rawYear);
    const yearPath = `years/${yearId}`;
    if (!year) {
      issue(issues, 'error', 'INVALID_RECORD', yearPath, 'expected an object');
      continue;
    }
    reportUnknownKeys(
      year,
      new Set([
        'votingEnabled',
        'submissionsClosed',
        'groups',
        'awardCategories',
        'projects',
        'votes',
        'awards',
      ]),
      yearPath,
      issues,
    );
    data.years.push({
      id: yearId,
      votingEnabled: year.votingEnabled === true,
      submissionsClosed: year.submissionsClosed === true,
    });

    const groups = entries(year.groups, `${yearPath}/groups`, issues);
    sourceCounts.groups += groups.length;
    const knownGroups = new Set<string>();
    for (const [groupId, rawGroup] of groups) {
      const group = object(rawGroup);
      const at = `${yearPath}/groups/${groupId}`;
      if (!group || !text(group.name) || !text(group.creator)) {
        issue(issues, 'error', 'INVALID_RECORD', at, 'name and creator are required');
        continue;
      }
      const creatorId = text(group.creator)!;
      if (!knownUsers.has(creatorId)) {
        issue(issues, 'error', 'MISSING_REFERENCE', `${at}/creator`, creatorId);
        continue;
      }
      knownGroups.add(groupId);
      data.groups.push({
        id: groupId,
        sourceId: groupId,
        yearId,
        name: text(group.name)!,
        creatorId,
        createdAt: timestamp(group.ts),
      });
    }

    const categories = entries(
      year.awardCategories,
      `${yearPath}/awardCategories`,
      issues,
    );
    sourceCounts.awardCategories += categories.length;
    const knownCategories = new Set<string>();
    for (const [categoryId, rawCategory] of categories) {
      const category = object(rawCategory);
      const at = `${yearPath}/awardCategories/${categoryId}`;
      if (!category || !text(category.name) || !text(category.creator)) {
        issue(issues, 'error', 'INVALID_RECORD', at, 'name and creator are required');
        continue;
      }
      const creatorId = text(category.creator)!;
      if (!knownUsers.has(creatorId)) {
        issue(issues, 'error', 'MISSING_REFERENCE', `${at}/creator`, creatorId);
        continue;
      }
      knownCategories.add(categoryId);
      data.awardCategories.push({
        id: categoryId,
        sourceId: categoryId,
        yearId,
        name: text(category.name)!,
        creatorId,
        createdAt: timestamp(category.ts),
      });
    }

    const projects = entries(year.projects, `${yearPath}/projects`, issues);
    sourceCounts.projects += projects.length;
    const knownProjects = new Set<string>();
    for (const [projectId, rawProject] of projects) {
      const project = object(rawProject);
      const at = `${yearPath}/projects/${projectId}`;
      if (!project || !text(project.name) || !text(project.creator)) {
        issue(issues, 'error', 'INVALID_RECORD', at, 'name and creator are required');
        continue;
      }
      const creatorId = text(project.creator)!;
      if (!knownUsers.has(creatorId)) {
        issue(issues, 'error', 'MISSING_REFERENCE', `${at}/creator`, creatorId);
        continue;
      }
      const groupId = text(project.group);
      if (groupId && !knownGroups.has(groupId)) {
        issue(issues, 'warning', 'MISSING_REFERENCE', `${at}/group`, groupId);
      }
      if (text(project.videoUrl)) {
        issue(
          issues,
          'warning',
          'DEFERRED_VIDEO_REFERENCE',
          `${at}/videoUrl`,
          'legacy video URLs require explicit Stream promotion and are not attachment media',
        );
      }
      knownProjects.add(projectId);
      data.projects.push({
        id: projectId,
        sourceId: projectId,
        yearId,
        creatorId,
        groupId: groupId && knownGroups.has(groupId) ? groupId : null,
        name: text(project.name)!,
        summary: text(project.summary),
        repository: text(project.repository),
        kind: project.isIdea === true ? 'idea' : 'project',
        needsHelp: project.needHelp === true,
        helpDetails: text(project.needHelpComments),
        createdAt: timestamp(project.ts),
      });

      const members = entries(project.members, `${at}/members`, issues);
      sourceCounts.projectMembers += members.length;
      for (const [userId, rawMember] of members) {
        if (!knownUsers.has(userId)) {
          issue(issues, 'error', 'MISSING_REFERENCE', `${at}/members/${userId}`, userId);
          continue;
        }
        const member = object(rawMember);
        data.projectMembers.push({
          projectId,
          userId,
          joinedAt: timestamp(member?.ts),
        });
      }

      const nominations = [
        project.nominatedAwardCategory1,
        project.nominatedAwardCategory2,
      ];
      for (const [positionIndex, rawCategoryId] of nominations.entries()) {
        const categoryId = text(rawCategoryId);
        if (!categoryId) continue;
        sourceCounts.projectNominations += 1;
        if (!knownCategories.has(categoryId)) {
          issue(
            issues,
            'error',
            'MISSING_REFERENCE',
            `${at}/nominatedAwardCategory${positionIndex + 1}`,
            categoryId,
          );
          continue;
        }
        if (
          data.projectNominations.some(
            (row) => row.projectId === projectId && row.awardCategoryId === categoryId,
          )
        ) {
          issue(issues, 'error', 'DUPLICATE_RELATIONSHIP', at, categoryId);
          continue;
        }
        data.projectNominations.push({
          projectId,
          awardCategoryId: categoryId,
          position: (positionIndex + 1) as 1 | 2,
        });
      }

      const mediaRecords = entries(project.media, `${at}/media`, issues);
      sourceCounts.media += mediaRecords.length;
      for (const [mediaId, rawMedia] of mediaRecords) {
        const media = object(rawMedia);
        const mediaAt = `${at}/media/${mediaId}`;
        const sourcePath = normalizeSourcePath(text(media?.path) ?? '');
        const originalName = text(media?.name);
        if (!media || !sourcePath || !originalName) {
          issue(
            issues,
            'error',
            'INVALID_RECORD',
            mediaAt,
            'safe path and name are required',
          );
          continue;
        }
        const expectedPrefix = `projects/${projectId}/media/${mediaId}/`;
        if (!sourcePath.startsWith(expectedPrefix)) {
          issue(issues, 'error', 'INVALID_STORAGE_PATH', `${mediaAt}/path`, sourcePath);
          continue;
        }
        const manifestEntry = manifestByPath.get(sourcePath);
        let sizeBytes = manifestEntry?.size ?? null;
        let checksum = manifestEntry?.sha256?.toLowerCase() ?? null;
        let storageFile: string | null = null;
        if (manifestEntry?.file && storageRoot) {
          storageFile = safeStorageFile(storageRoot, manifestEntry.file);
          if (!storageFile) {
            issue(issues, 'error', 'INVALID_STORAGE_FILE', mediaAt, manifestEntry.file);
          } else {
            try {
              const bytes = await readFile(storageFile);
              sizeBytes = bytes.byteLength;
              const actual = createHash('sha256').update(bytes).digest('hex');
              if (checksum && checksum !== actual) {
                issue(
                  issues,
                  'error',
                  'CHECKSUM_MISMATCH',
                  sourcePath,
                  `${checksum} != ${actual}`,
                );
              }
              checksum = actual;
            } catch {
              issue(issues, 'error', 'MISSING_STORAGE_FILE', sourcePath, storageFile);
              storageFile = null;
            }
          }
        }
        const status = manifestEntry ? 'available' : 'missing';
        if (!manifestEntry) {
          issue(issues, 'warning', 'MISSING_STORAGE_OBJECT', sourcePath, mediaAt);
        }
        data.media.push({
          id: mediaId,
          sourceId: mediaId,
          projectId,
          sourcePath,
          originalName,
          r2Key: deterministicR2Key(projectId, mediaId, originalName),
          mediaType: text(manifestEntry?.contentType),
          sizeBytes,
          sha256: checksum,
          status,
          createdAt: timestamp(media.ts),
          storageFile,
        });
      }
    }

    const votes = entries(year.votes, `${yearPath}/votes`, issues);
    sourceCounts.votes += votes.length;
    for (const [voteId, rawVote] of votes) {
      const vote = object(rawVote);
      const at = `${yearPath}/votes/${voteId}`;
      const creatorId = text(vote?.creator);
      const projectId = text(vote?.project);
      const categoryId = text(vote?.awardCategory);
      if (!vote || !creatorId || !projectId || !categoryId) {
        issue(
          issues,
          'error',
          'INVALID_RECORD',
          at,
          'creator, project and awardCategory are required',
        );
        continue;
      }
      const missing = [
        !knownUsers.has(creatorId) && `creator:${creatorId}`,
        !knownProjects.has(projectId) && `project:${projectId}`,
        !knownCategories.has(categoryId) && `awardCategory:${categoryId}`,
      ].filter(Boolean);
      if (missing.length) {
        issue(issues, 'error', 'MISSING_REFERENCE', at, missing.join(', '));
        continue;
      }
      const project = data.projects.find(
        (row) => row.id === projectId && row.yearId === yearId,
      );
      const isProjectMember = data.projectMembers.some(
        (row) => row.projectId === projectId && row.userId === creatorId,
      );
      if (project?.creatorId === creatorId || isProjectMember) {
        issue(
          issues,
          'warning',
          'IGNORED_LEGACY_SELF_VOTE',
          at,
          'vote conflicts with current eligibility rules and was not imported',
        );
        continue;
      }
      data.votes.push({
        id: voteId,
        sourceId: voteId,
        yearId,
        creatorId,
        projectId,
        awardCategoryId: categoryId,
        createdAt: timestamp(vote.ts),
      });
    }

    const awards = entries(year.awards, `${yearPath}/awards`, issues);
    sourceCounts.awards += awards.length;
    for (const [awardId, rawAward] of awards) {
      const award = object(rawAward);
      const at = `${yearPath}/awards/${awardId}`;
      const creatorId = text(award?.creator);
      const projectId = text(award?.project);
      const categoryId = text(award?.awardCategory);
      if (!award || !creatorId || !projectId || !categoryId) {
        issue(issues, 'error', 'INVALID_RECORD', at, 'references are required');
        continue;
      }
      const missing = [
        !knownUsers.has(creatorId) && `creator:${creatorId}`,
        !knownProjects.has(projectId) && `project:${projectId}`,
        !knownCategories.has(categoryId) && `awardCategory:${categoryId}`,
      ].filter(Boolean);
      if (missing.length) {
        issue(issues, 'error', 'MISSING_REFERENCE', at, missing.join(', '));
        continue;
      }
      data.awards.push({
        id: awardId,
        sourceId: awardId,
        yearId,
        projectId,
        categoryId,
        name:
          text(award.name) ??
          data.awardCategories.find(
            (category) => category.id === categoryId && category.yearId === yearId,
          )!.name,
        creatorId,
        createdAt: timestamp(award.ts),
      });
    }
  }

  const linkedPaths = new Set(data.media.map((row) => row.sourcePath));
  const storageObjects = [...manifestByPath.entries()].map(([sourcePath, entry]) => {
    const media = data.media.find((row) => row.sourcePath === sourcePath);
    if (!linkedPaths.has(sourcePath)) {
      issue(
        issues,
        'warning',
        'UNREFERENCED_STORAGE_OBJECT',
        sourcePath,
        'no database media record',
      );
    }
    return {
      sourcePath,
      destinationKey: media?.r2Key ?? null,
      size: media?.sizeBytes ?? entry.size ?? null,
      sha256: media?.sha256 ?? entry.sha256?.toLowerCase() ?? null,
      status: media
        ? media.storageFile || !storageRoot
          ? 'validated'
          : 'missing'
        : 'unreferenced',
      projectId: media?.projectId ?? null,
      mediaId: media?.id ?? null,
    };
  });
  for (const media of data.media.filter((row) => row.status === 'missing')) {
    storageObjects.push({
      sourcePath: media.sourcePath,
      destinationKey: media.r2Key,
      size: null,
      sha256: null,
      status: 'missing',
      projectId: media.projectId,
      mediaId: media.id,
    });
  }

  detectDuplicates(data, issues);
  return {data, issues, sourceCounts, storageObjects};
}

export function deterministicR2Key(projectId: string, mediaId: string, name: string) {
  const safeName = name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return `projects/${keySegment(projectId)}/media/${keySegment(mediaId)}/${safeName || 'attachment'}`;
}

function keySegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) =>
    [...Buffer.from(character)]
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

export function normalizeSourcePath(value: string) {
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0'))
    return null;
  const normalized = path.posix.normalize(value);
  if (normalized === '.' || normalized.startsWith('../') || normalized !== value)
    return null;
  return normalized;
}

function safeStorageFile(root: string, relative: string) {
  if (!relative || path.isAbsolute(relative)) return null;
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relative);
  return candidate.startsWith(`${absoluteRoot}${path.sep}`) ? candidate : null;
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function entries(value: unknown, at: string, issues: MigrationIssue[]) {
  if (value === undefined || value === null || value === '')
    return [] as Array<[string, unknown]>;
  const record = object(value);
  if (!record) {
    issue(issues, 'error', 'INVALID_COLLECTION', at, 'expected an object map');
    return [] as Array<[string, unknown]>;
  }
  return Object.entries(record);
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : '1970-01-01T00:00:00.000Z';
}

function reportUnknownKeys(
  value: JsonObject,
  known: Set<string>,
  at: string,
  issues: MigrationIssue[],
) {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      issue(
        issues,
        'warning',
        'UNKNOWN_COLLECTION',
        at ? `${at}/${key}` : key,
        'path is not part of the supported legacy model',
      );
    }
  }
}

function issue(
  issues: MigrationIssue[],
  severity: 'error' | 'warning',
  code: string,
  at: string,
  message: string,
) {
  issues.push({severity, code, path: at, message});
}

function emptyData(): MigrationData {
  return {
    users: [],
    years: [],
    groups: [],
    projects: [],
    projectMembers: [],
    awardCategories: [],
    projectNominations: [],
    votes: [],
    awards: [],
    media: [],
  };
}

function detectDuplicates(data: MigrationData, issues: MigrationIssue[]) {
  for (const name of entityNames) {
    const rows = data[name] as unknown as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    for (const [index, row] of rows.entries()) {
      const key =
        name === 'projectMembers'
          ? `${stringValue(row.projectId)}:${stringValue(row.userId)}`
          : name === 'projectNominations'
            ? `${stringValue(row.projectId)}:${stringValue(row.awardCategoryId)}`
            : stringValue(row.id);
      if (seen.has(key)) issue(issues, 'error', 'DUPLICATE_ID', `${name}/${index}`, key);
      seen.add(key);
    }
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function readStorageManifest(
  filename: string,
): Promise<StorageManifestEntry[]> {
  const parsed: unknown = JSON.parse(await readFile(filename, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Storage manifest must be a JSON array');
  return parsed.map((value, index) => {
    const entry = object(value);
    if (!entry || typeof entry.path !== 'string') {
      throw new Error(`Storage manifest entry ${index} must contain a path`);
    }
    return {
      path: entry.path,
      file: typeof entry.file === 'string' ? entry.file : undefined,
      size: typeof entry.size === 'number' ? entry.size : undefined,
      sha256: typeof entry.sha256 === 'string' ? entry.sha256 : undefined,
      contentType: typeof entry.contentType === 'string' ? entry.contentType : undefined,
    };
  });
}
