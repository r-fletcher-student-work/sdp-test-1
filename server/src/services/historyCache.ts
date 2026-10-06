import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractHistory } from './gitLog.js';
import { collectPathSets, computeDirAggregates, type DirAggregate } from './metrics.js';
import type { CommitRecord, RepoMeta } from '../types.js';

const exec = promisify(execFile);

export interface HistoryData {
  head: string;
  /** chronological non-merge commits reachable from HEAD */
  commits: CommitRecord[];
  /**
   * Directory aggregates memoized per commit: dirAggs[i] maps a directory
   * path ('' = root) to commits[i]'s added/removed sums within it.
   */
  dirAggs: DirAggregate[];
  /** every file path ever touched, including deleted files */
  files: Set<string>;
  /** every directory prefix of a touched path, '' = root included */
  dirs: Set<string>;
}

interface CacheEntry {
  head: string;
  data: HistoryData;
}

// In-memory per-repo cache, invalidated when HEAD moves. Replaced by a
// persistent incremental cache in Phase 6.
const cache = new Map<string, CacheEntry>();

/**
 * Parsed history for a repository, shared by every analysis endpoint so the
 * git log pass runs at most once per HEAD state.
 */
export async function getHistory(repo: RepoMeta): Promise<HistoryData> {
  const { stdout } = await exec('git', ['-C', repo.path, 'rev-parse', 'HEAD']);
  const head = stdout.trim();

  const cached = cache.get(repo.id);
  if (cached && cached.head === head) {
    return cached.data;
  }

  const commits = await extractHistory(repo.path);
  const pathSets = collectPathSets(commits);
  const data: HistoryData = {
    head,
    commits,
    dirAggs: computeDirAggregates(commits),
    files: pathSets.files,
    dirs: pathSets.dirs,
  };
  cache.set(repo.id, { head, data });
  return data;
}
