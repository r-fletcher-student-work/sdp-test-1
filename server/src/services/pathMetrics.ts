import type { CommitRecord } from '../types.js';
import type { HistoryData } from './historyCache.js';
import {
  CHART_MAX_POINTS,
  downsampleSeries,
  type CommitPoint,
  type Totals,
} from './metrics.js';

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
  /** modifications n(H,o): commits whose churn on the object is > 0 */
  modifications: number;
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
function perCommitDelta(
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
 * Metrics for one object (file, directory, or root) over the full-history
 * commit set H: totals, modifications n(H,o), cumulative series, and — for
 * directories — immediate-children aggregates (own + recursive children).
 */
export function computePathMetrics(history: HistoryData, rawPath: string): PathMetrics | null {
  const path = normalizePath(rawPath);
  const type = resolvePathType(history, path);
  if (!type) return null;

  const { commits } = history;
  const totals: Totals = { added: 0, removed: 0, growth: 0, churn: 0 };
  let modifications = 0;
  const series: CommitPoint[] = [];

  for (let i = 0; i < commits.length; i++) {
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

  const children = type === 'dir' ? computeChildren(history, path) : [];
  return {
    path,
    type,
    totals,
    modifications,
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
 * children reuse the memoized per-commit aggregates). Sorted dirs-first,
 * then by name.
 */
function computeChildren(history: HistoryData, dirPath: string): ChildMetric[] {
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

  for (let i = 0; i < history.commits.length; i++) {
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
 * deltas (drives the commits list endpoint).
 */
export function commitDeltas(
  history: HistoryData,
  path: string,
  type: PathType,
): Array<{ commit: CommitRecord; added: number; removed: number }> {
  const deltas: Array<{ commit: CommitRecord; added: number; removed: number }> = [];
  for (let i = 0; i < history.commits.length; i++) {
    const delta = perCommitDelta(history, path, type, i);
    if (delta) deltas.push({ commit: history.commits[i], ...delta });
  }
  return deltas;
}
