export interface AwardCategorySummary {
  id: string;
  yearId: string;
  name: string;
}

export interface NominationSummary {
  categoryId: string;
  position: 1 | 2;
}

export interface VotingProject {
  id: string;
  name: string;
  summary: string;
  groupName: string | null;
  memberNames: string[];
  nominations: NominationSummary[];
  eligible: boolean;
}

export interface VoteSummary {
  id: string;
  yearId: string;
  projectId: string;
  categoryId: string;
}

export interface VotingResponse {
  year: {id: string; votingEnabled: boolean};
  categories: AwardCategorySummary[];
  projects: VotingProject[];
  votes: VoteSummary[];
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
  nominations: NominationSummary[];
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

export interface NominationsWriteRequest {
  categoryIds: string[];
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

export interface VoteResult {
  categoryId: string;
  categoryName: string;
  projectId: string;
  projectName: string;
  groupName: string | null;
  voteCount: number;
}

export interface AnalyticsResponse {
  years: AnalyticsYear[];
  voteResults: VoteResult[];
}
