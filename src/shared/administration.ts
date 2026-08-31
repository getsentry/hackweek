export interface AwardCategorySummary {
  id: string;
  yearId: string;
  name: string;
}

export interface VoteSummary {
  id: string;
  yearId: string;
  projectId: string;
  categoryId: string;
}

export interface BallotSelection extends VoteSummary {
  projectName: string;
  projectActive: boolean;
  nominationEligible: boolean;
}

export interface BallotStatusResponse {
  year: {id: string; votingEnabled: boolean};
  categories: AwardCategorySummary[];
  votes: BallotSelection[];
}

export interface VoteWriteRequest {
  yearId: string;
  projectId: string;
  categoryId: string;
}

export interface AwardSummary {
  id: string;
  yearId: string;
  projectId: string;
  projectName: string;
  categoryId: string;
  categoryName: string;
  name: string;
}

export interface AdminProjectSummary {
  id: string;
  name: string;
  videoStatus: import('./videos').VideoStatus | null;
}

export interface ScreeningOrderItem {
  projectId: string;
  projectName: string;
  position: number;
}

export interface AdminYearResponse {
  year: {
    id: string;
    votingEnabled: boolean;
    submissionsClosed: boolean;
    isCurrent: boolean;
  };
  categories: AwardCategorySummary[];
  awards: AwardSummary[];
  projects: AdminProjectSummary[];
  screeningOrder: ScreeningOrderItem[];
}

export interface YearWriteRequest {
  votingEnabled: boolean;
  submissionsClosed: boolean;
}

export interface NamedWriteRequest {
  name: string;
}

export interface AwardWriteRequest {
  name: string;
  projectId: string;
  categoryId: string;
}

export interface ScreeningOrderWriteRequest {
  projectIds: string[];
}

export interface AnalyticsYear {
  yearId: string;
  activeVoters: number;
  voteCount: number;
  projectCount: number;
  ideaCount: number;
  categoryCount: number;
  awardCount: number;
}

export interface VoteResultMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface VoteResult {
  categoryId: string;
  categoryName: string;
  projectId: string;
  projectName: string;
  groupName: string | null;
  members: VoteResultMember[];
  voteCount: number;
}

export interface AnalyticsResponse {
  years: AnalyticsYear[];
  voteResults: VoteResult[];
}

/** One ready-video project row for the admin analytics CSV export. */
export interface AnalyticsVideoExportRow {
  voteRank: number;
  totalVotes: number;
  projectId: string;
  projectName: string;
  projectUrl: string;
  videoId: string;
  videoUrl: string;
  originalName: string;
  durationSeconds: number | null;
  description: string;
  teamMembers: string;
  awards: string;
  categoryVotes: string;
}
