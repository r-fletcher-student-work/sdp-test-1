import { authorKey, resolveCommitSet, type CommitSetFilter } from './commitSet.js';
import type { HistoryData } from './historyCache.js';
import { ratio } from './metrics.js';
import {
  normalizePath,
  perCommitDelta,
  resolvePathType,
  type PathType,
} from './pathMetrics.js';
import type { AuthorIdentity, AuthorMerge } from './authorMerges.js';
import { distinctIdentities, identityFromCommit } from './authorMerges.js';

export interface AuthorInfo {
  name: string;
  email: string;
  /** canonical identity key 'Name <email>' used by the author filter */
  key: string;
  /** non-merge commits by this canonical author across the whole history */
  commitCount: number;
  /** raw/mailmapped identities grouped into this author */
  aliases: AuthorIdentity[];
  /** commits by this author in the active set H */
  selectedCommitCount: number;
  /** author modifications n(H,o,a) */
  modifications: number;
  /** author churn λ(H,o,a) */
  churn: number;
  /** author ownership ω(H,o,a) */
  ownership: number;
}

export interface AuthorList {
  authors: AuthorInfo[];
  identities: AuthorIdentity[];
  merges: AuthorMerge[];
}

function aliasMap(merges: AuthorMerge[]): Map<string, AuthorIdentity[]> {
  const aliases = new Map<string, AuthorIdentity[]>();
  for (const merge of merges) {
    aliases.set(merge.canonical.key, merge.aliases);
  }
  return aliases;
}

function pathTypeFor(history: HistoryData, rawPath: string): { path: string; type: PathType } | null {
  const path = normalizePath(rawPath);
  const type = resolvePathType(history, path);
  return type ? { path, type } : null;
}

/**
 * Distinct canonical authors plus author metrics over the active commit set H
 * and selected path/object. The path defaults to the repository root.
 */
export function listAuthors(
  history: HistoryData,
  filter: CommitSetFilter = {},
  rawPath = '',
  rawIdentities: AuthorIdentity[] = distinctIdentities(history.commits),
  merges: AuthorMerge[] = [],
): AuthorList {
  const object = pathTypeFor(history, rawPath) ?? { path: '', type: 'dir' as const };
  const indices = resolveCommitSet(history, filter);
  const aliasesByAuthor = aliasMap(merges);
  const authors = new Map<string, AuthorInfo>();
  const ensure = (commitIndex: number): AuthorInfo => {
    const commit = history.commits[commitIndex];
    const key = authorKey(commit.authorName, commit.authorEmail);
    let author = authors.get(key);
    if (!author) {
      author = {
        name: commit.authorName,
        email: commit.authorEmail,
        key,
        commitCount: 0,
        aliases: aliasesByAuthor.get(key) ?? [],
        selectedCommitCount: 0,
        modifications: 0,
        churn: 0,
        ownership: 0,
      };
      authors.set(key, author);
    }
    return author;
  };

  for (let i = 0; i < history.commits.length; i++) {
    ensure(i).commitCount++;
  }

  let totalObjectChurn = 0;
  for (const i of indices) {
    const author = ensure(i);
    author.selectedCommitCount++;
    const delta = perCommitDelta(history, object.path, object.type, i);
    if (!delta) continue;
    const churn = delta.added + delta.removed;
    totalObjectChurn += churn;
    author.churn += churn;
    if (churn > 0) author.modifications++;
  }

  for (const merge of merges) {
    if (!authors.has(merge.canonical.key)) {
      authors.set(merge.canonical.key, {
        ...merge.canonical,
        commitCount: 0,
        aliases: merge.aliases,
        selectedCommitCount: 0,
        modifications: 0,
        churn: 0,
        ownership: 0,
      });
    }
  }

  const sortedAuthors = [...authors.values()]
    .map((author) => ({ ...author, ownership: ratio(author.churn, totalObjectChurn) }))
    .sort((a, b) => b.churn - a.churn || b.commitCount - a.commitCount || a.name.localeCompare(b.name));
  const visibleAuthors = filter.author
    ? sortedAuthors.filter((author) => author.key === filter.author)
    : sortedAuthors;

  return {
    authors: visibleAuthors,
    identities: rawIdentities,
    merges,
  };
}

export function commitIdentityMap(history: HistoryData): Map<string, AuthorIdentity> {
  const items = new Map<string, AuthorIdentity>();
  for (const commit of history.commits) {
    const item = identityFromCommit(commit);
    items.set(item.key, item);
  }
  return items;
}
