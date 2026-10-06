import type { CommitRecord } from '../types.js';
import type { HistoryData } from './historyCache.js';
import {
  CHART_MAX_POINTS,
  downsampleSeries,
  ratio,
  type CommitPoint,
  type Totals,
} from './metrics.js';
import { resolveCommitSet, type CommitSetFilter } from './commitSet.js';

export type PathType = 'file' | 'dir';

export interface ChildMetric {
  name: string;
  /** path relative to the repo root ('' prefix form) */
  path: string;
  type: PathType;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  /** modifications n(H,o) for this child */
  modifications: number;
}

export interface PathMetrics {
  /** repo-root-relative path; '' is the root directory */
  path: string;
  type: PathType;
  totals: Totals;
  /** modifications n(H,o): commits in the active set whose churn on the object is > 0 */
  modifications: number;
  /** size of the active commit set |H| (time range or manual selection ∩ author) */
  commitSetSize: number;
  /** modification frequency η = n/|H| (0 when |H| = 0) */
  frequency: number;
  /** churn rate ρ = λ(H,o)/|H| (0 when |H| = 0) */
  churnRate: number;
  /**
   * Cumulative chronological series scoped to the path, sampled to at most
   * CHART_MAX_POINTS points (cumulative values exact at every plotted point).
   */
  timeseries: CommitPoint[];
  /** immediate children with their recursive totals; directories only, else [] */
  children: ChildMetric[];
}

/** Strip slash edges; '' stays '' (the root directory). */
export function normalizePath(rawPath: string): string {
  return rawPath.replace(/^\/+|\/+$/g, '');
}

/** Resolve a normalized path to its kind, or null if history never touched it. */
export function resolvePathType(history: HistoryData, path: string): PathType | null {
  if (path === '') return 'dir';
  if (history.files.has(path)) return 'file';
  if (history.dirs.has(path)) return 'dir';
  return null;
}

/**
 * One commit's added/removed counts scoped to the path (per-commit l+/l-),
 * or null when the commit did not touch the object.
 */
export function perCommitDelta(
  history: HistoryData,
  path: string,
  type: PathType,
  commitIndex: number,
): { added: number; removed: number } | null {
  if (type === 'dir') {
    return history.dirAggs[commitIndex].get(path) ?? null;
  }
  for (const change of history.commits[commitIndex].changes) {
    if (change.path === path) {
      return { added: change.added, removed: change.removed };
    }
  }
  return null;
}

/**
 * Metrics for one object (file, directory, or root) over the active commit
 * set H (defaults to the full history): totals, modifications n(H,o),
 * frequencies η/ρ, cumulative series, and — for directories —
 * immediate-children aggregates (own + recursive children).
 */
export function computePathMetrics(
  history: HistoryData,
  rawPath: string,
  filter: CommitSetFilter = {},
): PathMetrics | null {
  const path = normalizePath(rawPath);
  const type = resolvePathType(history, path);
  if (!type) return null;

  const indices = resolveCommitSet(history, filter);
  const { commits } = history;
  const totals: Totals = { added: 0, removed: 0, growth: 0, churn: 0 };
  let modifications = 0;
  const series: CommitPoint[] = [];

  for (const i of indices) {
    const delta = perCommitDelta(history, path, type, i);
    if (!delta) continue; // commit did not touch the object — no series point
    const growth = delta.added - delta.removed;
    const churn = delta.added + delta.removed;
    totals.added += delta.added;
    totals.removed += delta.removed;
    totals.growth += growth;
    totals.churn += churn;
    if (churn > 0) modifications++;
    series.push({
      hash: commits[i].hash,
      date: commits[i].committerDate,
      subject: commits[i].subject,
      added: delta.added,
      removed: delta.removed,
      growth,
      churn,
      cumAdded: totals.added,
      cumRemoved: totals.removed,
      cumGrowth: totals.growth,
      cumChurn: totals.churn,
    });
  }

  const children = type === 'dir' ? computeChildren(history, path, indices) : [];
  return {
    path,
    type,
    totals,
    modifications,
    commitSetSize: indices.length,
    frequency: ratio(modifications, indices.length),
    churnRate: ratio(totals.churn, indices.length),
    timeseries: downsampleSeries(series, CHART_MAX_POINTS),
    children,
  };
}

interface MutableChild {
  name: string;
  path: string;
  type: PathType;
  added: number;
  removed: number;
  modifications: number;
  /** churn accumulated within the commit being scanned */
  commitChurn: number;
}

/**
 * Immediate children of a directory with their recursive totals (directory
 * children reuse the memoized per-commit aggregates), scoped to the commit
 * set given by `indices`. Sorted dirs-first, then by name.
 */
function computeChildren(history: HistoryData, dirPath: string, indices: number[]): ChildMetric[] {
  const prefix = dirPath === '' ? '' : `${dirPath}/`;
  const children = new Map<string, MutableChild>();
  const touchedInCommit = new Set<MutableChild>();

  const childKey = (name: string, type: PathType): string => `${type}:${name}`;
  const touch = (name: string, type: PathType, added: number, removed: number): void => {
    const key = childKey(name, type);
    let child = children.get(key);
    if (!child) {
      child = {
        name,
        path: prefix + name,
        type,
        added: 0,
        removed: 0,
        modifications: 0,
        commitChurn: 0,
      };
      children.set(key, child);
    }
    child.added += added;
    child.removed += removed;
    child.commitChurn += added + removed;
    touchedInCommit.add(child);
  };

  for (const i of indices) {
    for (const change of history.commits[i].changes) {
      if (!change.path.startsWith(prefix)) continue;
      const rest = change.path.slice(prefix.length);
      if (!rest) continue; // only possible when prefix === ''
      const slash = rest.indexOf('/');
      if (slash === -1) {
        touch(rest, 'file', change.added, change.removed);
      } else {
        touch(rest.slice(0, slash), 'dir', change.added, change.removed);
      }
    }
    // Close the commit: children with churn in it count as one modification.
    for (const child of touchedInCommit) {
      if (child.commitChurn > 0) child.modifications++;
      child.commitChurn = 0;
    }
    touchedInCommit.clear();
  }

  return [...children.values()]
    .map(({ name, path: childPath, type: childType, added, removed, modifications }) => ({
      name,
      path: childPath,
      type: childType,
      added,
      removed,
      growth: added - removed,
      churn: added + removed,
      modifications,
    }))
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
    );
}

/**
 * Commits that touched the path, chronological, with their per-commit
 * deltas (drives the commits list endpoint). When `indices` is given, only
 * commits of that active commit set are considered.
 */
export function commitDeltas(
  history: HistoryData,
  path: string,
  type: PathType,
  indices?: number[],
): Array<{ commit: CommitRecord; added: number; removed: number }> {
  const deltas: Array<{ commit: CommitRecord; added: number; removed: number }> = [];
  const order = indices ?? history.commits.map((_, i) => i);
  for (const i of order) {
    const delta = perCommitDelta(history, path, type, i);
    if (delta) deltas.push({ commit: history.commits[i], ...delta });
  }
  return deltas;
}
