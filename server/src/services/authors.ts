import type { HistoryData } from './historyCache.js';
import { authorKey } from './commitSet.js';

export interface AuthorInfo {
  name: string;
  email: string;
  /** canonical identity key 'Name <email>' used by the author filter */
  key: string;
  /** non-merge commits in the parsed history */
  commitCount: number;
}

/** Distinct authors in the history, busiest first (name as tiebreak). */
export function listAuthors(history: HistoryData): AuthorInfo[] {
  const counts = new Map<string, AuthorInfo>();
  for (const commit of history.commits) {
    const key = authorKey(commit.authorName, commit.authorEmail);
    let entry = counts.get(key);
    if (!entry) {
      entry = { name: commit.authorName, email: commit.authorEmail, key, commitCount: 0 };
      counts.set(key, entry);
    }
    entry.commitCount++;
  }
  return [...counts.values()].sort(
    (a, b) => b.commitCount - a.commitCount || a.name.localeCompare(b.name),
  );
}
