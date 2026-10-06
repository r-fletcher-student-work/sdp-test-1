import { describe, expect, it } from 'vitest';
import { listAuthors } from '../src/services/authors.js';
import { computeDirAggregates, collectPathSets } from '../src/services/metrics.js';
import type { HistoryData } from '../src/services/historyCache.js';
import type { CommitRecord } from '../src/types.js';

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
  const pathSets = collectPathSets(commits);
  return {
    head: 'test',
    commits,
    dirAggs: computeDirAggregates(commits),
    files: pathSets.files,
    dirs: pathSets.dirs,
  };
}

describe('listAuthors', () => {
  const h = history([
    commit({
      hash: 'a',
      changes: [{ path: 'src/app.ts', added: 10, removed: 0 }],
    }),
    commit({
      hash: 'b',
      authorName: 'Bob',
      authorEmail: 'bob@example.com',
      changes: [
        { path: 'src/app.ts', added: 2, removed: 5 },
        { path: 'README.md', added: 4, removed: 0 },
      ],
    }),
    commit({
      hash: 'c',
      changes: [{ path: 'src/lib/util.ts', added: 3, removed: 0 }],
    }),
  ]);

  it('computes author churn, modifications and ownership for a path', () => {
    const result = listAuthors(h, {}, 'src/app.ts');
    const alice = result.authors.find((author) => author.key === 'Alice <alice@example.com>')!;
    const bob = result.authors.find((author) => author.key === 'Bob <bob@example.com>')!;

    expect(alice).toMatchObject({ commitCount: 2, selectedCommitCount: 2, modifications: 1, churn: 10 });
    expect(bob).toMatchObject({ commitCount: 1, selectedCommitCount: 1, modifications: 1, churn: 7 });
    expect(alice.ownership).toBeCloseTo(10 / 17);
    expect(bob.ownership).toBeCloseTo(7 / 17);
  });

  it('respects the active commit set', () => {
    const result = listAuthors(h, { author: 'Bob <bob@example.com>' }, '');
    expect(result.authors).toHaveLength(2);
    expect(result.authors[0]).toMatchObject({ key: 'Bob <bob@example.com>', selectedCommitCount: 1, churn: 11, ownership: 1 });
    expect(result.authors[1]).toMatchObject({ key: 'Alice <alice@example.com>', selectedCommitCount: 0, churn: 0, ownership: 0 });
  });
});
