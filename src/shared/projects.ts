import type {AwardCategorySummary, AwardSummary} from './administration';
import type {SessionUser} from './api';

export type ProjectKind = 'project' | 'idea';

/** Maximum size, in bytes, accepted for a single project media upload. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

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
  hasVideo: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  media: MediaSummary[];
  awards: AwardSummary[];
  nominationCategoryIds: string[];
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canClaim: boolean;
    canManageMedia: boolean;
    canVote: boolean;
  };
}

export interface YearsResponse {
  years: YearSummary[];
}

export interface YearResponse {
  year: YearSummary;
  groups: GroupSummary[];
  awards: AwardSummary[];
  myProjects: ProjectSummary[];
}

export interface ProjectsResponse {
  projects: ProjectSummary[];
  nextCursor: string | null;
  projectCount: number;
  ideaCount: number;
}

export interface ProjectResponse {
  project: ProjectDetail;
}

export interface UserProfileYear {
  yearId: string;
  projects: ProjectSummary[];
}

export interface UserProfileResponse {
  user: ProjectMember;
  highlights: {
    hackweekCount: number;
    projectCount: number;
    ideaCount: number;
    awardCount: number;
  };
  awards: AwardSummary[];
  years: UserProfileYear[];
}

export interface ProjectOptionsResponse {
  users: ProjectMember[];
  groups: GroupSummary[];
  categories: AwardCategorySummary[];
}

export interface ProjectWriteRequest {
  yearId: string;
  name: string;
  summary: string;
  repository: string | null;
  kind: ProjectKind;
  groupId: string | null;
  memberIds: string[];
  nominationCategoryIds: string[];
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
