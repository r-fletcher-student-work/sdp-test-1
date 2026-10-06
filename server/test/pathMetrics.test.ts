import { describe, expect, it } from 'vitest';
import { computeDirAggregates } from '../src/services/metrics.js';
import {
  computePathMetrics,
  normalizePath,
  resolvePathType,
} from '../src/services/pathMetrics.js';
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

describe('computeDirAggregates', () => {
  it('attributes file changes to every ancestor directory, root included', () => {
    const [agg] = computeDirAggregates([
      commit({
        hash: 'a',
        changes: [
          { path: 'src/app.ts', added: 4, removed: 1 },
          { path: 'src/lib/util.ts', added: 3, removed: 0 },
          { path: 'README.md', added: 1, removed: 0 },
        ],
      }),
    ]);
    expect(agg.get('')).toEqual({ added: 8, removed: 1 });
    expect(agg.get('src')).toEqual({ added: 7, removed: 1 });
    expect(agg.get('src/lib')).toEqual({ added: 3, removed: 0 });
    expect(agg.has('src/lib/util.ts')).toBe(false);
  });

  it('memoizes per commit without carrying sums across commits', () => {
    const aggs = computeDirAggregates([
      commit({ hash: 'a', changes: [{ path: 'src/a.ts', added: 5, removed: 0 }] }),
      commit({ hash: 'b', parent: 'a', changes: [{ path: 'src/b.ts', added: 2, removed: 3 }] }),
    ]);
    expect(aggs[0].get('src')).toEqual({ added: 5, removed: 0 });
    expect(aggs[1].get('src')).toEqual({ added: 2, removed: 3 });
  });
});

const commits: CommitRecord[] = [
  commit({
    hash: 'c1',
    committerDate: 100,
    subject: 'add app',
    changes: [
      { path: 'src/app.ts', added: 10, removed: 0 },
      { path: 'README.md', added: 3, removed: 0 },
    ],
  }),
  commit({
    hash: 'c2',
    parent: 'c1',
    committerDate: 200,
    authorName: 'Bob',
    authorEmail: 'bob@example.com',
    subject: 'lib',
    changes: [
      { path: 'src/lib/util.ts', added: 4, removed: 0 },
      { path: 'src/app.ts', added: 2, removed: 5 },
    ],
  }),
  commit({
    hash: 'c3',
    parent: 'c2',
    committerDate: 300,
    subject: 'deep helper',
    changes: [{ path: 'src/lib/deep/helper.ts', added: 5, removed: 0 }],
  }),
];

describe('computePathMetrics', () => {
  it('aggregates a directory recursively with immediate-children breakdown', () => {
    const metrics = computePathMetrics(history(commits), 'src');
    expect(metrics).not.toBeNull();
    expect(metrics!.type).toBe('dir');
    expect(metrics!.totals).toEqual({ added: 21, removed: 5, growth: 16, churn: 26 });
    expect(metrics!.modifications).toBe(3);
    // dirs first, then files, each alphabetical; children carry recursive totals
    expect(metrics!.children.map((c) => `${c.type}:${c.name}`)).toEqual(['dir:lib', 'file:app.ts']);
    expect(metrics!.children[0]).toMatchObject({
      path: 'src/lib',
      added: 9,
      removed: 0,
      growth: 9,
      churn: 9,
      modifications: 2,
    });
    expect(metrics!.children[1]).toMatchObject({
      path: 'src/app.ts',
      added: 12,
      removed: 5,
      churn: 17,
      modifications: 2,
    });
  });

  it('computes per-commit deltas and cumulative series for a file', () => {
    const metrics = computePathMetrics(history(commits), 'src/app.ts');
    expect(metrics!.type).toBe('file');
    expect(metrics!.totals).toEqual({ added: 12, removed: 5, growth: 7, churn: 17 });
    expect(metrics!.modifications).toBe(2);
    expect(metrics!.children).toEqual([]);
    expect(metrics!.timeseries).toHaveLength(2);
    expect(metrics!.timeseries[0]).toMatchObject({ hash: 'c1', added: 10, cumChurn: 10 });
    expect(metrics!.timeseries[1]).toMatchObject({
      hash: 'c2',
      added: 2,
      removed: 5,
      cumAdded: 12,
      cumRemoved: 5,
      cumGrowth: 7,
      cumChurn: 17,
    });
  });

  it('treats the root path as the repository totals', () => {
    const root = computePathMetrics(history(commits), '');
    const rootViaSlashes = computePathMetrics(history(commits), '/');
    expect(root!.totals).toEqual({ added: 24, removed: 5, growth: 19, churn: 29 });
    expect(root!.modifications).toBe(3);
    expect(rootViaSlashes!.path).toBe('');
    expect(rootViaSlashes!.totals).toEqual(root!.totals);
    expect(root!.children.map((c) => c.path)).toEqual(['src', 'README.md']);
  });

  it('does not count pure renames (0/0 churn) as modifications', () => {
    const renameHistory = history([
      commit({ hash: 'r1', changes: [{ path: 'a.txt', added: 6, removed: 0 }] }),
      commit({ hash: 'r2', parent: 'r1', changes: [{ path: 'b.txt', added: 0, removed: 0 }] }),
    ]);
    expect(resolvePathType(renameHistory, 'b.txt')).toBe('file');
    const metrics = computePathMetrics(renameHistory, 'b.txt');
    expect(metrics!.totals).toEqual({ added: 0, removed: 0, growth: 0, churn: 0 });
    expect(metrics!.modifications).toBe(0);
    expect(metrics!.timeseries).toHaveLength(1);
  });

  it('returns null for paths history never touched and normalizes paths', () => {
    const h = history(commits);
    expect(computePathMetrics(h, 'missing')).toBeNull();
    expect(computePathMetrics(h, 'src/missing.ts')).toBeNull();
    expect(normalizePath('/src//')).toBe('src');
    expect(normalizePath('')).toBe('');
  });

  it('samples a long file history to the chart cap keeping endpoints exact', () => {
    const long: CommitRecord[] = [];
    for (let i = 0; i < 2000; i++) {
      long.push(
        commit({
          hash: `c${i}`,
          parent: i === 0 ? null : `c${i - 1}`,
          committerDate: 1000 + i,
          changes: [{ path: 'hot/file.txt', added: 1, removed: 0 }],
        }),
      );
    }
    const metrics = computePathMetrics(history(long), 'hot/file.txt');
    expect(metrics!.timeseries.length).toBe(800);
    expect(metrics!.timeseries[0]).toMatchObject({ hash: 'c0', cumAdded: 1 });
    const last = metrics!.timeseries[metrics!.timeseries.length - 1];
    expect(last.cumAdded).toBe(2000);
    expect(last.hash).toBe('c1999');
  });
});

describe('computePathMetrics with commit-set filters', () => {
  const h = history(commits);

  it('scopes totals, modifications and frequencies to the author filter', () => {
    const metrics = computePathMetrics(h, 'src', { author: 'Bob <bob@example.com>' })!;
    expect(metrics.totals).toEqual({ added: 6, removed: 5, growth: 1, churn: 11 });
    expect(metrics.modifications).toBe(1);
    expect(metrics.commitSetSize).toBe(1);
    expect(metrics.frequency).toBe(1);
    expect(metrics.churnRate).toBe(11);
    expect(metrics.timeseries).toHaveLength(1);
    // 'src' is a directory: c2's delta sums util.ts (+4/-0) and app.ts (+2/-5)
    expect(metrics.timeseries[0]).toMatchObject({ hash: 'c2', added: 6, removed: 5 });
  });

  it('applies the time range to the object and its children', () => {
    const root = computePathMetrics(h, '', { from: 150, to: 250 })!; // only c2
    expect(root.commitSetSize).toBe(1);
    expect(root.totals).toEqual({ added: 6, removed: 5, growth: 1, churn: 11 });
    expect(root.children.map((child) => child.path)).toEqual(['src']);
    expect(root.children[0]).toMatchObject({ added: 6, removed: 5, modifications: 1 });

    const src = computePathMetrics(h, 'src', { from: 150, to: 250 })!;
    expect(src.children.map((child) => `${child.type}:${child.name}`)).toEqual([
      'dir:lib',
      'file:app.ts',
    ]);
    expect(src.children[1]).toMatchObject({ added: 2, removed: 5, modifications: 1 });
  });

  it('resolves a manual hash selection', () => {
    const metrics = computePathMetrics(h, '', { hashes: ['c1', 'c3'] })!;
    expect(metrics.commitSetSize).toBe(2);
    expect(metrics.totals).toEqual({ added: 18, removed: 0, growth: 18, churn: 18 });
    expect(metrics.modifications).toBe(2);
    expect(metrics.frequency).toBe(1);
  });

  it('returns zeros for an empty commit set per the brief', () => {
    const metrics = computePathMetrics(h, 'src', { author: 'Nobody <nobody@example.com>' })!;
    expect(metrics.commitSetSize).toBe(0);
    expect(metrics.totals).toEqual({ added: 0, removed: 0, growth: 0, churn: 0 });
    expect(metrics.modifications).toBe(0);
    expect(metrics.frequency).toBe(0);
    expect(metrics.churnRate).toBe(0);
    expect(metrics.children).toEqual([]);
    expect(metrics.timeseries).toEqual([]);
  });
});
