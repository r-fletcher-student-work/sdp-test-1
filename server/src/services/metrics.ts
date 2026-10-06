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
  /** modifications n(H, root): commits in the set whose churn is > 0 */
  modifications: number;
  /** modification frequency η = n/|H| (0 when |H| = 0) */
  frequency: number;
  /** churn rate ρ = λ(H, root)/|H| (0 when |H| = 0) */
  churnRate: number;
  /**
   * Cumulative series for the chart, chronological. Sampled to at most
   * CHART_MAX_POINTS points on very large histories — cumulative values stay
   * exact at every sampled point. The full per-commit list is served by the
   * commits endpoint from Phase 2.
   */
  timeseries: CommitPoint[];
}

/** SPEC division semantics: 0 when the commit set is empty. */
export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Chart payload cap — keeps the browser chart responsive on ~100k-commit repos. */
export const CHART_MAX_POINTS = 800;

/**
 * Even sampling that keeps the first and last points. When downsampling, the
 * index step is > 1 so sampled indices are strictly increasing: every returned
 * point is a real commit whose cumulative values are exact.
 */
export function downsampleSeries(points: CommitPoint[], max: number): CommitPoint[] {
  if (points.length <= max) return points;
  const sampled: CommitPoint[] = new Array(max);
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    sampled[i] = points[Math.round(i * step)];
  }
  return sampled;
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
  let modifications = 0;

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
    if (churn > 0) modifications++; // 1[λ(h,o) > 0]

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
    modifications,
    frequency: ratio(modifications, commits.length),
    churnRate: ratio(totals.churn, commits.length),
    timeseries: downsampleSeries(timeseries, CHART_MAX_POINTS),
  };
}

/**
 * Per-commit directory aggregation, keyed by directory path ('' = root).
 * Built once per history and memoized; consumers look up a directory's
 * added/removed sums for a given commit in O(1).
 */
export type DirAggregate = Map<string, { added: number; removed: number }>;

/**
 * Directory metrics per commit, following the brief's immediate-children
 * recursion: every changed file contributes its added/removed counts to each
 * ancestor directory (root '' included). Aggregate over the whole history by
 * summing a path's entries across commits.
 */
export function computeDirAggregates(commits: CommitRecord[]): DirAggregate[] {
  return commits.map((commit) => {
    const agg: DirAggregate = new Map();
    for (const change of commit.changes) {
      const parts = change.path.split('/');
      let prefix = '';
      let entry = agg.get(prefix);
      if (!entry) {
        entry = { added: 0, removed: 0 };
        agg.set(prefix, entry);
      }
      entry.added += change.added;
      entry.removed += change.removed;
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        let dirEntry = agg.get(prefix);
        if (!dirEntry) {
          dirEntry = { added: 0, removed: 0 };
          agg.set(prefix, dirEntry);
        }
        dirEntry.added += change.added;
        dirEntry.removed += change.removed;
      }
    }
    return agg;
  });
}

/**
 * Every file path ever touched (rename destinations included, deleted files
 * kept — the brief's H.files is a historical union) and every directory
 * prefix of a touched path ('' = root included).
 */
export function collectPathSets(commits: CommitRecord[]): {
  files: Set<string>;
  dirs: Set<string>;
} {
  const files = new Set<string>();
  const dirs = new Set<string>(['']);
  for (const commit of commits) {
    for (const change of commit.changes) {
      files.add(change.path);
      const parts = change.path.split('/');
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        dirs.add(prefix);
      }
    }
  }
  return { files, dirs };
}
