import { afterEach, describe, expect, it } from 'vitest';
import { clearAuthorMerges, distinctIdentities, loadAuthorMerges, upsertAuthorMerge, applyAuthorMerges } from '../src/services/authorMerges.js';
import { computeDirAggregates } from '../src/services/metrics.js';
import type { HistoryData } from '../src/services/historyCache.js';
import type { CommitRecord } from '../src/types.js';

const repoId = 'author-merge-test';

function commit(partial: Partial<CommitRecord> & { hash: string }): CommitRecord {
  return {
    parent: null,
    authorName: 'Alice',
    authorEmail: 'alice@example.com',
    committerDate: 0,
    subject: '',
    changes: [],
    ...partial,
  };
}

function history(commits: CommitRecord[]): HistoryData {
  return {
    head: 'test',
    commits,
    dirAggs: computeDirAggregates(commits),
    files: new Set(['a.txt']),
    dirs: new Set(['']),
  };
}

afterEach(() => clearAuthorMerges(repoId));

describe('author merge persistence', () => {
  const base = history([
    commit({ hash: 'a', authorName: 'Alice', authorEmail: 'alice@example.com' }),
    commit({ hash: 'b', authorName: 'A. Liddell', authorEmail: 'alice@users.noreply.github.com' }),
    commit({ hash: 'c', authorName: 'Bob', authorEmail: 'bob@example.com' }),
  ]);

  it('persists and applies manual author merges', () => {
    const identities = distinctIdentities(base.commits);
    const merges = upsertAuthorMerge(repoId, identities, 'Alice <alice@example.com>', [
      'A. Liddell <alice@users.noreply.github.com>',
    ]);

    expect(loadAuthorMerges(repoId)).toEqual(merges);
    const merged = applyAuthorMerges(base, merges);
    expect(merged.commits.map((c) => `${c.authorName} <${c.authorEmail}>`)).toEqual([
      'Alice <alice@example.com>',
      'Alice <alice@example.com>',
      'Bob <bob@example.com>',
    ]);
  });

  it('rejects unknown or single-identity merges', () => {
    const identities = distinctIdentities(base.commits);
    expect(() => upsertAuthorMerge(repoId, identities, 'Alice <alice@example.com>', [])).toThrow(
      /at least two/,
    );
    expect(() =>
      upsertAuthorMerge(repoId, identities, 'Alice <alice@example.com>', ['Missing <missing@example.com>']),
    ).toThrow(/Unknown author identity/);
  });
});
