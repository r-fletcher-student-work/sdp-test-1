import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractHistory } from './gitLog.js';
import { computeRepoSummary, type RepoSummary } from './metrics.js';
import type { RepoMeta } from '../types.js';

const exec = promisify(execFile);

interface CacheEntry {
  head: string;
  summary: RepoSummary;
}

// In-memory per-repo cache, invalidated when HEAD moves. Replaced by a
// persistent incremental cache in Phase 6.
const cache = new Map<string, CacheEntry>();

export async function getRepoSummary(repo: RepoMeta): Promise<RepoSummary> {
  const { stdout } = await exec('git', ['-C', repo.path, 'rev-parse', 'HEAD']);
  const head = stdout.trim();

  const cached = cache.get(repo.id);
  if (cached && cached.head === head) {
    return cached.summary;
  }

  const commits = await extractHistory(repo.path);
  const summary = computeRepoSummary(commits);
  cache.set(repo.id, { head, summary });
  return summary;
}
