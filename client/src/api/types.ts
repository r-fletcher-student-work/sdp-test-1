export interface RepoPublic {
  id: string;
  name: string;
  addedAt: string;
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
  timeseries: CommitPoint[];
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
