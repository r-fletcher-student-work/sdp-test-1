import { getHistory } from './historyCache.js';
import { computeRepoSummary, type RepoSummary } from './metrics.js';
import type { RepoMeta } from '../types.js';

/**
 * Repository-level metrics = directory metrics on the root, computed from the
 * shared cached history (one git pass per HEAD state, see historyCache).
 */
export async function getRepoSummary(repo: RepoMeta): Promise<RepoSummary> {
  const { commits } = await getHistory(repo);
  return computeRepoSummary(commits);
}
