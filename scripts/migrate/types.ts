export const entityNames = [
  'users',
  'years',
  'groups',
  'projects',
  'projectMembers',
  'awardCategories',
  'projectNominations',
  'votes',
  'awards',
  'media',
] as const;

export type EntityName = (typeof entityNames)[number];
export type Severity = 'error' | 'warning';

export interface MigrationIssue {
  severity: Severity;
  code: string;
  path: string;
  message: string;
}

export interface StorageManifestEntry {
  path: string;
  file?: string;
  size?: number;
  sha256?: string;
  contentType?: string;
}

export interface UserRow {
  id: string;
  sourceUid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface YearRow {
  id: string;
  votingEnabled: boolean;
  submissionsClosed: boolean;
}

export interface GroupRow {
  id: string;
  sourceId: string;
  yearId: string;
  name: string;
  creatorId: string;
  createdAt: string;
}

export interface ProjectRow {
  id: string;
  sourceId: string;
  yearId: string;
  creatorId: string;
  groupId: string | null;
  name: string;
  summary: string | null;
  repository: string | null;
  kind: 'project' | 'idea';
  needsHelp: boolean;
  helpDetails: string | null;
  createdAt: string;
}

export interface ProjectMemberRow {
  projectId: string;
  userId: string;
  joinedAt: string;
}

export interface AwardCategoryRow {
  id: string;
  sourceId: string;
  yearId: string;
  name: string;
  creatorId: string;
  createdAt: string;
}

export interface NominationRow {
  projectId: string;
  awardCategoryId: string;
  position: 1 | 2;
}

export interface VoteRow {
  id: string;
  sourceId: string;
  yearId: string;
  creatorId: string;
  projectId: string;
  awardCategoryId: string;
  createdAt: string;
}

export interface AwardRow {
  id: string;
  sourceId: string;
  yearId: string;
  projectId: string;
  categoryId: string;
  name: string;
  creatorId: string;
  createdAt: string;
}

export interface MediaRow {
  id: string;
  sourceId: string;
  projectId: string;
  sourcePath: string;
  originalName: string;
  r2Key: string;
  mediaType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  status: 'available' | 'missing';
  createdAt: string;
  storageFile: string | null;
}

export interface MigrationData {
  users: UserRow[];
  years: YearRow[];
  groups: GroupRow[];
  projects: ProjectRow[];
  projectMembers: ProjectMemberRow[];
  awardCategories: AwardCategoryRow[];
  projectNominations: NominationRow[];
  votes: VoteRow[];
  awards: AwardRow[];
  media: MediaRow[];
}

export interface MigrationReport {
  generatedAt: string;
  dryRun: boolean;
  source: {database: string; storageManifest: string | null};
  sourceCounts: Record<EntityName, number>;
  transformedCounts: Record<EntityName, number>;
  destinationCounts: Partial<Record<EntityName, number>>;
  destinationSourceCounts: Partial<Record<EntityName, number>>;
  storage: {
    sourceObjects: number;
    linkedObjects: number;
    copied: number;
    unchanged: number;
    missing: number;
    failed: number;
    objects: Array<{
      sourcePath: string;
      destinationKey: string | null;
      size: number | null;
      sha256: string | null;
      status: string;
      projectId: string | null;
      mediaId: string | null;
    }>;
  };
  issues: MigrationIssue[];
}
