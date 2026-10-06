import type { CommitRecord } from '../types.js';

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
  /** one point per commit, chronological */
  timeseries: CommitPoint[];
}

/**
 * Repository-level metrics = directory metrics on the root. By the brief's
 * immediate-children recursion, aggregating the root equals summing over all
 * changed files of each commit (aggregation is additive across the tree).
 */
export function computeRepoSummary(commits: CommitRecord[]): RepoSummary {
  const authorKeys = new Set<string>();
  const filePaths = new Set<string>();
  const totals: Totals = { added: 0, removed: 0, growth: 0, churn: 0 };
  const timeseries: CommitPoint[] = [];

  for (const commit of commits) {
    authorKeys.add(`${commit.authorName} <${commit.authorEmail}>`);

    let added = 0;
    let removed = 0;
    for (const change of commit.changes) {
      filePaths.add(change.path);
      added += change.added;
      removed += change.removed;
    }
    const growth = added - removed;
    const churn = added + removed;

    totals.added += added;
    totals.removed += removed;
    totals.growth += growth;
    totals.churn += churn;

    timeseries.push({
      hash: commit.hash,
      date: commit.committerDate,
      subject: commit.subject,
      added,
      removed,
      growth,
      churn,
      cumAdded: totals.added,
      cumRemoved: totals.removed,
      cumGrowth: totals.growth,
      cumChurn: totals.churn,
    });
  }

  return {
    commitCount: commits.length,
    authorCount: authorKeys.size,
    fileCount: filePaths.size,
    firstCommitDate: commits.length > 0 ? commits[0].committerDate : null,
    lastCommitDate: commits.length > 0 ? commits[commits.length - 1].committerDate : null,
    totals,
    timeseries,
  };
}
