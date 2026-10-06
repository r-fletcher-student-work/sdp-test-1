import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { extractHistory } from './gitLog.js';
import { applyAuthorMerges, getAuthorMergeVersion, loadAuthorMerges } from './authorMerges.js';
import { collectPathSets, computeDirAggregates, type DirAggregate } from './metrics.js';
import { dirs, ensureDataDirs } from './repoStore.js';
import type { CommitRecord, RepoMeta } from '../types.js';

const exec = promisify(execFile);
const CACHE_VERSION = 1;

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

interface MergedCacheEntry extends CacheEntry {
  mergeVersion: string;
}

interface PersistedHistory {
  version: number;
  repoId: string;
  head: string;
  commits: CommitRecord[];
}

// In-memory per-repo cache, invalidated when HEAD moves. The raw commit model is
// also persisted under server/data/cache so server restarts do not re-run git log.
const cache = new Map<string, CacheEntry>();
const mergedCache = new Map<string, MergedCacheEntry>();

/**
 * Parsed history for a repository, shared by every analysis endpoint so the
 * git log pass runs at most once per HEAD state.
 */
export async function getHistory(repo: RepoMeta): Promise<HistoryData> {
  const head = await readHead(repo.path);

  const cached = cache.get(repo.id);
  if (cached && cached.head === head) {
    return cached.data;
  }

  const persisted = loadPersistedHistory(repo.id, head);
  const commits = persisted ?? await extractHistory(repo.path);
  if (!persisted) savePersistedHistory(repo.id, head, commits);

  const data = buildHistoryData(head, commits);
  cache.set(repo.id, { head, data });
  return data;
}

/** Parsed history with persisted manual author merges applied. */
export async function getMergedHistory(repo: RepoMeta): Promise<HistoryData> {
  const history = await getHistory(repo);
  const mergeVersion = getAuthorMergeVersion(repo.id);
  const cached = mergedCache.get(repo.id);
  if (cached && cached.head === history.head && cached.mergeVersion === mergeVersion) {
    return cached.data;
  }
  const data = applyAuthorMerges(history, loadAuthorMerges(repo.id));
  mergedCache.set(repo.id, { head: history.head, mergeVersion, data });
  return data;
}

export function clearHistoryCacheForTests(): void {
  cache.clear();
  mergedCache.clear();
}

async function readHead(repoPath: string): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, 'rev-parse', 'HEAD']);
  return stdout.trim();
}

function buildHistoryData(head: string, commits: CommitRecord[]): HistoryData {
  const pathSets = collectPathSets(commits);
  return {
    head,
    commits,
    dirAggs: computeDirAggregates(commits),
    files: pathSets.files,
    dirs: pathSets.dirs,
  };
}

function cacheFile(repoId: string, head: string): string {
  return path.join(dirs.cacheDir, `${repoId}-${head}.json`);
}

function loadPersistedHistory(repoId: string, head: string): CommitRecord[] | null {
  const file = cacheFile(repoId, head);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedHistory;
    if (parsed.version !== CACHE_VERSION || parsed.repoId !== repoId || parsed.head !== head) return null;
    return Array.isArray(parsed.commits) ? parsed.commits : null;
  } catch {
    return null;
  }
}

function savePersistedHistory(repoId: string, head: string, commits: CommitRecord[]): void {
  ensureDataDirs();
  const payload: PersistedHistory = { version: CACHE_VERSION, repoId, head, commits };
  fs.writeFileSync(cacheFile(repoId, head), JSON.stringify(payload));
}
