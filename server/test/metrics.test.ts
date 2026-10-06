import { describe, expect, it } from 'vitest';
import { CHART_MAX_POINTS, computeRepoSummary } from '../src/services/metrics.js';
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

describe('computeRepoSummary', () => {
  it('computes per-commit growth and churn from added/removed', () => {
    const summary = computeRepoSummary([
      commit({ hash: 'a', committerDate: 100, changes: [{ path: 'f.txt', added: 10, removed: 0 }] }),
      commit({
        hash: 'b',
        parent: 'a',
        committerDate: 200,
        changes: [{ path: 'f.txt', added: 2, removed: 5 }],
      }),
    ]);
    expect(summary.totals).toEqual({ added: 12, removed: 5, growth: 7, churn: 17 });
    expect(summary.modifications).toBe(2);
    expect(summary.frequency).toBe(1);
    expect(summary.churnRate).toBe(8.5);
    expect(summary.timeseries[0]).toMatchObject({ growth: 10, churn: 10, cumGrowth: 10, cumChurn: 10 });
    expect(summary.timeseries[1]).toMatchObject({ growth: -3, churn: 7, cumGrowth: 7, cumChurn: 17 });
  });

  it('aggregates across nested files (root-level sum)', () => {
    const summary = computeRepoSummary([
      commit({
        hash: 'a',
        committerDate: 100,
        changes: [
          { path: 'src/a.ts', added: 4, removed: 1 },
          { path: 'src/lib/b.ts', added: 3, removed: 0 },
          { path: 'README.md', added: 1, removed: 0 },
        ],
      }),
    ]);
    expect(summary.totals.added).toBe(8);
    expect(summary.totals.removed).toBe(1);
    expect(summary.totals.churn).toBe(9);
    expect(summary.fileCount).toBe(3);
  });

  it('counts distinct authors and files, and first/last commit dates', () => {
    const summary = computeRepoSummary([
      commit({
        hash: 'a',
        committerDate: 100,
        authorName: 'Alice',
        authorEmail: 'a@x',
        changes: [{ path: 'f', added: 1, removed: 0 }],
      }),
      commit({
        hash: 'b',
        parent: 'a',
        committerDate: 200,
        authorName: 'Bob',
        authorEmail: 'b@x',
        changes: [{ path: 'g', added: 1, removed: 0 }],
      }),
      commit({
        hash: 'c',
        parent: 'b',
        committerDate: 300,
        authorName: 'Alice',
        authorEmail: 'a@x',
        changes: [{ path: 'g', added: 0, removed: 1 }],
      }),
    ]);
    expect(summary.commitCount).toBe(3);
    expect(summary.authorCount).toBe(2);
    expect(summary.fileCount).toBe(2);
    expect(summary.firstCommitDate).toBe(100);
    expect(summary.lastCommitDate).toBe(300);
  });

  it('samples the chart timeseries on very large histories, keeping endpoints exact', () => {
    const total = 2000;
    const commits: CommitRecord[] = [];
    for (let i = 0; i < total; i++) {
      commits.push(
        commit({
          hash: `c${i}`,
          parent: i === 0 ? null : `c${i - 1}`,
          committerDate: 1000 + i,
          changes: [{ path: `f${i}.txt`, added: 1, removed: 0 }],
        }),
      );
    }
    const summary = computeRepoSummary(commits);

    expect(summary.commitCount).toBe(total);
    expect(summary.totals).toEqual({ added: total, removed: 0, growth: total, churn: total });
    expect(summary.timeseries.length).toBe(CHART_MAX_POINTS);
    expect(summary.timeseries[0]).toMatchObject({ hash: 'c0', cumAdded: 1, cumChurn: 1 });
    expect(summary.timeseries[summary.timeseries.length - 1]).toMatchObject({
      hash: `c${total - 1}`,
      cumAdded: total,
      cumChurn: total,
    });
    // Sampled points are real commits in chronological order.
    for (let i = 1; i < summary.timeseries.length; i++) {
      expect(summary.timeseries[i].date).toBeGreaterThan(summary.timeseries[i - 1].date);
    }
  });

  it('returns an empty summary for an empty history', () => {
    expect(computeRepoSummary([])).toEqual({
      commitCount: 0,
      authorCount: 0,
      fileCount: 0,
      firstCommitDate: null,
      lastCommitDate: null,
      totals: { added: 0, removed: 0, growth: 0, churn: 0 },
      modifications: 0,
      frequency: 0,
      churnRate: 0,
      timeseries: [],
    });
  });
});
