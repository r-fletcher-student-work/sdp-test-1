import { describe, expect, it } from 'vitest';
import { CommitSetError, resolveCommitSet } from '../src/services/commitSet.js';
import { computeDirAggregates } from '../src/services/metrics.js';
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
  const files = new Set<string>();
  const dirs = new Set<string>(['']);
  for (const c of commits) {
    for (const change of c.changes) {
      files.add(change.path);
      const parts = change.path.split('/');
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        dirs.add(prefix);
      }
    }
  }
  return { head: 'test', commits, dirAggs: computeDirAggregates(commits), files, dirs };
}

const commits: CommitRecord[] = [
  commit({
    hash: 'aaaaaaaa1111',
    committerDate: 100,
    changes: [{ path: 'a.txt', added: 1, removed: 0 }],
  }),
  commit({
    hash: 'bbbbbbbb2222',
    parent: 'aaaaaaaa1111',
    committerDate: 200,
    authorName: 'Bob',
    authorEmail: 'bob@example.com',
    changes: [{ path: 'b.txt', added: 1, removed: 0 }],
  }),
  commit({
    hash: 'cccccccc3333',
    parent: 'bbbbbbbb2222',
    committerDate: 300,
    changes: [{ path: 'c.txt', added: 1, removed: 0 }],
  }),
];
const h = history(commits);

describe('resolveCommitSet', () => {
  it('returns every commit when no filter is given', () => {
    expect(resolveCommitSet(h, {})).toEqual([0, 1, 2]);
  });

  it('applies the time range with inclusive from and exclusive to', () => {
    expect(resolveCommitSet(h, { from: 100, to: 300 })).toEqual([0, 1]);
    expect(resolveCommitSet(h, { from: 101 })).toEqual([1, 2]);
    expect(resolveCommitSet(h, { to: 200 })).toEqual([0]);
    expect(resolveCommitSet(h, { from: 300, to: 400 })).toEqual([2]);
  });

  it('resolves manual hashes case-insensitively and in chronological order', () => {
    expect(resolveCommitSet(h, { hashes: ['CCCCCCcc3333', 'aaaaaaaa1111'] })).toEqual([0, 2]);
  });

  it('resolves unique hash prefixes', () => {
    expect(resolveCommitSet(h, { hashes: ['bbb'] })).toEqual([1]);
  });

  it('rejects unknown hashes and ambiguous prefixes', () => {
    expect(() => resolveCommitSet(h, { hashes: ['dddd'] })).toThrow(/Unknown commit hash/);
    const ambiguous = history([
      commit({ hash: 'dddd1111', changes: [{ path: 'x', added: 1, removed: 0 }] }),
      commit({
        hash: 'dddd2222',
        parent: 'dddd1111',
        changes: [{ path: 'y', added: 1, removed: 0 }],
      }),
    ]);
    expect(() => resolveCommitSet(ambiguous, { hashes: ['dddd'] })).toThrow(
      /Ambiguous commit hash prefix/,
    );
  });

  it('intersects the author filter with the selection', () => {
    expect(resolveCommitSet(h, { author: 'Bob <bob@example.com>' })).toEqual([1]);
    expect(resolveCommitSet(h, { from: 100, to: 300, author: 'Alice <alice@example.com>' })).toEqual([0]);
    expect(resolveCommitSet(h, { author: 'Nobody <nobody@example.com>' })).toEqual([]);
  });

  it('throws CommitSetError so the API can map it to 400', () => {
    const error = new CommitSetError('boom');
    expect(error).toBeInstanceOf(Error);
  });
});
