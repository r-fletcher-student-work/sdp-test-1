export type RepoSource = 'zip' | 'url';

export interface RepoPublic {
  id: string;
  name: string;
  addedAt: string;
  source?: RepoSource;
  sourceUrl?: string;
}

export type CloneJobStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface CloneJob {
  id: string;
  url: string;
  status: CloneJobStatus;
  message: string;
  repo?: RepoPublic;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface Totals {
  added: number;
  removed: number;
  growth: number;
  churn: number;
}

export interface CommitPoint extends Totals {
  hash: string;
  date: number;
  subject: string;
  cumAdded: number;
  cumRemoved: number;
  cumGrowth: number;
  cumChurn: number;
}

export interface RepoSummary {
  commitCount: number;
  authorCount: number;
  fileCount: number;
  firstCommitDate: number | null;
  lastCommitDate: number | null;
  totals: Totals;
  /** commits in the active set H whose churn on the object is > 0 */
  modifications: number;
  /** η = modifications / |H|; 0 when |H| = 0 */
  frequency: number;
  /** ρ = churn / |H|; 0 when |H| = 0 */
  churnRate: number;
  timeseries: CommitPoint[];
}

/**
 * Active dashboard filter (SPEC sections 1 and 4): the commit set H is the
 * manual hash selection or the time range (`from` inclusive, `to` exclusive),
 * intersected with the author filter. A path query only scopes the object.
 */
export interface CommitSetFilter {
  /** inclusive lower committer-date bound (unix seconds) */
  from?: number;
  /** exclusive upper committer-date bound (unix seconds) */
  to?: number;
  /** manual selection: full hashes or unique prefixes; overrides from/to */
  hashes?: string[];
  /** canonical author identity 'Name <email>' */
  author?: string;
}

export interface AuthorIdentity {
  name: string;
  email: string;
  /** canonical identity key 'Name <email>' used by the author filter */
  key: string;
}

export interface AuthorMerge {
  canonical: AuthorIdentity;
  aliases: AuthorIdentity[];
}

export interface AuthorInfo extends AuthorIdentity {
  /** non-merge commits by this canonical author across the whole history */
  commitCount: number;
  /** raw/mailmapped identities grouped into this author */
  aliases: AuthorIdentity[];
  /** commits by this author in the active set H */
  selectedCommitCount: number;
  /** author modifications n(H,o,a) */
  modifications: number;
  /** author churn λ(H,o,a) */
  churn: number;
  /** author ownership ω(H,o,a) */
  ownership: number;
}

export interface TreeNode {
  name: string;
  /** repo-root-relative path; '' for the root node */
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

export interface ChildMetric {
  name: string;
  path: string;
  type: 'file' | 'dir';
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
}

export interface PathMetrics {
  /** repo-root-relative path; '' is the root directory */
  path: string;
  type: 'file' | 'dir';
  totals: Totals;
  /** commits whose churn on the object is > 0 */
  modifications: number;
  /** number of commits in the active set H */
  commitSetSize: number;
  /** η = modifications / |H|; 0 when |H| = 0 */
  frequency: number;
  /** ρ = churn / |H|; 0 when |H| = 0 */
  churnRate: number;
  timeseries: CommitPoint[];
  /** immediate children with recursive totals; directories only, else [] */
  children: ChildMetric[];
}

export interface CommitListItem {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerDate: number;
  subject: string;
  added: number;
  removed: number;
}
