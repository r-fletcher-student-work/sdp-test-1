import { getHistory } from './historyCache.js';
import { computeRepoSummary, type RepoSummary } from './metrics.js';
import { resolveCommitSet, type CommitSetFilter } from './commitSet.js';
import type { RepoMeta } from '../types.js';

/**
 * Repository-level metrics = directory metrics on the root, computed from the
 * shared cached history (one git pass per HEAD state, see historyCache) over
 * the active commit set H (time range or manual selection ∩ author).
 */
export async function getRepoSummary(
  repo: RepoMeta,
  filter: CommitSetFilter = {},
): Promise<RepoSummary> {
  const history = await getHistory(repo);
  const subset = resolveCommitSet(history, filter).map((i) => history.commits[i]);
  return computeRepoSummary(subset);
}
