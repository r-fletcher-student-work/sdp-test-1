import type { HistoryData } from './historyCache.js';

/**
 * Active dashboard filter (SPEC sections 1 and 4): the commit set H is the
 * manual hash selection or the time range (`from` inclusive, `to` exclusive),
 * intersected with the author filter. The path query scopes the measured
 * object o — it does not shrink H.
 */
export interface CommitSetFilter {
  /** inclusive lower committer-date bound (unix seconds) */
  from?: number;
  /** exclusive upper committer-date bound (unix seconds) */
  to?: number;
  /** manual selection: full hashes or unique prefixes; overrides from/to */
  hashes?: string[];
  /** canonical author identity 'Name <email>' */
  author?: string;
}

/** Canonical author identity used for filtering and grouping. */
export function authorKey(name: string, email: string): string {
  return `${name} <${email}>`;
}

/** Thrown for unresolvable or ambiguous manual commit selections. */
export class CommitSetError extends Error {}

/**
 * Resolve the active commit set H to chronological indices into
 * history.commits. Manual hashes override the time bounds; each hash may be a
 * full SHA (case-insensitive) or a unique prefix; unknown or ambiguous hashes
 * raise CommitSetError.
 */
export function resolveCommitSet(history: HistoryData, filter: CommitSetFilter): number[] {
  const indices =
    filter.hashes && filter.hashes.length > 0
      ? indicesForHashes(history, filter.hashes)
      : indicesForTimeRange(history, filter);
  if (!filter.author) return indices;
  return indices.filter((i) => {
    const commit = history.commits[i];
    return authorKey(commit.authorName, commit.authorEmail) === filter.author;
  });
}

function indicesForTimeRange(history: HistoryData, filter: CommitSetFilter): number[] {
  const indices: number[] = [];
  for (let i = 0; i < history.commits.length; i++) {
    const date = history.commits[i].committerDate;
    if (filter.from !== undefined && date < filter.from) continue;
    if (filter.to !== undefined && date >= filter.to) continue;
    indices.push(i);
  }
  return indices;
}

function indicesForHashes(history: HistoryData, hashes: string[]): number[] {
  const requested = [...new Set(hashes.map((h) => h.trim().toLowerCase()).filter(Boolean))];
  if (requested.length === 0) return [];

  const exact = new Map<string, number>();
  history.commits.forEach((commit, index) => {
    exact.set(commit.hash.toLowerCase(), index);
  });

  // Resolve the non-exact requests (prefixes) in a single linear pass.
  const prefixes = requested.filter((hash) => !exact.has(hash));
  const prefixMatches = new Map<string, number[]>();
  if (prefixes.length > 0) {
    for (let i = 0; i < history.commits.length; i++) {
      const lower = history.commits[i].hash.toLowerCase();
      for (const prefix of prefixes) {
        if (lower.startsWith(prefix)) {
          const matches = prefixMatches.get(prefix);
          if (matches) matches.push(i);
          else prefixMatches.set(prefix, [i]);
        }
      }
    }
  }

  const resolved = new Set<number>();
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const hash of requested) {
    const exactIndex = exact.get(hash);
    if (exactIndex !== undefined) {
      resolved.add(exactIndex);
      continue;
    }
    const matches = prefixMatches.get(hash);
    if (!matches || matches.length === 0) missing.push(hash);
    else if (matches.length > 1) ambiguous.push(hash);
    else resolved.add(matches[0]);
  }
  if (ambiguous.length > 0) {
    throw new CommitSetError(`Ambiguous commit hash prefix: ${ambiguous.join(', ')}`);
  }
  if (missing.length > 0) {
    throw new CommitSetError(`Unknown commit hash: ${missing.join(', ')}`);
  }
  return [...resolved].sort((a, b) => a - b);
}
