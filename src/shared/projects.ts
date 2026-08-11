import type {AwardSummary} from './administration';
import type {SessionUser} from './api';

export type ProjectKind = 'project' | 'idea';

export interface YearSummary {
  id: string;
  votingEnabled: boolean;
  submissionsClosed: boolean;
  isCurrent: boolean;
  projectCount: number;
  ideaCount: number;
  groupCount: number;
  participantCount: number;
}

export interface GroupSummary {
  id: string;
  yearId: string;
  name: string;
  projectCount: number;
}

export interface ProjectMember extends SessionUser {}

export interface MediaSummary {
  id: string;
  originalName: string;
  mediaType: string | null;
  sizeBytes: number | null;
  status: 'pending' | 'available' | 'missing' | 'failed';
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  yearId: string;
  name: string;
  summary: string;
  repository: string | null;
  kind: ProjectKind;
  needsHelp: boolean;
  helpDetails: string | null;
  createdAt: string;
  updatedAt: string;
  creator: ProjectMember;
  group: GroupSummary | null;
  members: ProjectMember[];
  mediaCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  media: MediaSummary[];
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canClaim: boolean;
    canManageMedia: boolean;
  };
}

export interface YearsResponse {
  years: YearSummary[];
}

export interface YearResponse {
  year: YearSummary;
  groups: GroupSummary[];
  awards: AwardSummary[];
}

export interface ProjectsResponse {
  projects: ProjectSummary[];
  nextCursor: string | null;
}

export interface ProjectResponse {
  project: ProjectDetail;
}

export interface ProjectOptionsResponse {
  users: ProjectMember[];
  groups: GroupSummary[];
}

export interface ProjectWriteRequest {
  yearId: string;
  name: string;
  summary: string;
  repository: string | null;
  kind: ProjectKind;
  groupId: string | null;
  memberIds: string[];
  needsHelp: boolean;
  helpDetails: string | null;
}

export interface GroupWriteRequest {
  name: string;
}

export interface GroupResponse {
  group: GroupSummary;
}

export interface MediaResponse {
  media: MediaSummary;
}
