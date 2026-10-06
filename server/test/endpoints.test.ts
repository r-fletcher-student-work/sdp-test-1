import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { newId, registerRepo, removeRepo } from '../src/services/repoStore.js';
import { createFixtureRepo, lines, type FixtureRepo } from './helpers/fixtureRepo.js';
import type { TreeNode } from '../src/services/tree.js';

/**
 * Route-level tests for the tree / metrics / commits endpoints against a
 * small real fixture repository.
 *
 * Fixture history:
 *   c1 (Alice): src/app.ts 10 lines, README.md 3 lines
 *   c2 (Bob):   src/app.ts rewritten to 12 different lines (+12/-10), src/lib/util.ts 4 lines
 *   c3 (Alice): src/lib/deep/helper.ts 5 lines
 */

const fixture: FixtureRepo = createFixtureRepo([
  {
    message: 'add app and readme',
    author: { name: 'Alice', email: 'alice@example.com' },
    date: '2024-01-01T12:00:00Z',
    files: [
      { path: 'src/app.ts', content: lines(1, 10) },
      { path: 'README.md', content: lines(1, 3) },
    ],
  },
  {
    message: 'rewrite app, add util',
    author: { name: 'Bob', email: 'bob@example.com' },
    date: '2024-02-01T12:00:00Z',
    files: [
      // fully different lines from c1 so the rewrite reports +12/-10
      { path: 'src/app.ts', content: lines(101, 112) },
      { path: 'src/lib/util.ts', content: lines(1, 4) },
    ],
  },
  {
    message: 'add deep helper',
    author: { name: 'Alice', email: 'alice@example.com' },
    date: '2024-03-01T12:00:00Z',
    files: [{ path: 'src/lib/deep/helper.ts', content: lines(1, 5) }],
  },
]);

const repoId = newId();
registerRepo(repoId, 'endpoint-fixture', fixture.path);

const app = createApp();
const server = app.listen(0);
let base = '';

interface TestResponse<T> {
  status: number;
  body: T;
}

async function get<T>(path: string): Promise<TestResponse<T>> {
  const res = await fetch(`${base}/api/repos/${repoId}${path}`);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

function childByName(node: TreeNode, name: string): TreeNode {
  const child = node.children?.find((c) => c.name === name);
  if (!child) throw new Error(`expected tree node "${name}" under "${node.path}"`);
  return child;
}

beforeAll(() => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to acquire a port for the test server');
  }
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
  removeRepo(repoId);
  fixture.cleanup();
});

interface MetricsBody {
  metrics: {
    path: string;
    type: 'file' | 'dir';
    totals: { added: number; removed: number; growth: number; churn: number };
    modifications: number;
    commitSetSize: number;
    frequency: number;
    churnRate: number;
    timeseries: unknown[];
    children: Array<{
      name: string;
      path: string;
      type: 'file' | 'dir';
      added: number;
      removed: number;
      modifications: number;
    }>;
  };
}

interface SummaryBody {
  summary: {
    commitCount: number;
    totals: { added: number; removed: number; growth: number; churn: number };
    modifications: number;
    frequency: number;
    churnRate: number;
  };
}

interface CommitsBody {
  total: number;
  commits: Array<{
    hash: string;
    authorName: string;
    subject: string;
    committerDate: number;
    added: number;
    removed: number;
  }>;
}

describe('tree, metrics, and commits endpoints', () => {
  it('serves the historical file tree with nested directories', async () => {
    const { status, body } = await get<{ tree: TreeNode }>('/tree');
    expect(status).toBe(200);

    const src = childByName(body.tree, 'src');
    expect(src.type).toBe('dir');
    expect(childByName(src, 'app.ts').type).toBe('file');
    const lib = childByName(src, 'lib');
    expect(childByName(lib, 'util.ts').type).toBe('file');
    const deep = childByName(lib, 'deep');
    expect(childByName(deep, 'helper.ts').type).toBe('file');
    expect(childByName(body.tree, 'README.md').type).toBe('file');
  });

  it('returns 404 for endpoints of an unknown repo', async () => {
    for (const path of ['/tree', '/metrics', '/commits', '/summary']) {
      const res = await fetch(`${base}/api/repos/does-not-exist${path}`);
      expect(res.status).toBe(404);
    }
  });

  it('computes directory metrics with immediate-children aggregates', async () => {
    const { status, body } = await get<MetricsBody>('/metrics?path=src');
    expect(status).toBe(200);
    expect(body.metrics.type).toBe('dir');
    // app.ts: 22/10, util.ts: 4/0, helper.ts: 5/0
    expect(body.metrics.totals).toEqual({ added: 31, removed: 10, growth: 21, churn: 41 });
    expect(body.metrics.modifications).toBe(3);
    expect(body.metrics.children).toEqual([
      {
        name: 'lib',
        path: 'src/lib',
        type: 'dir',
        added: 9,
        removed: 0,
        growth: 9,
        churn: 9,
        modifications: 2,
      },
      {
        name: 'app.ts',
        path: 'src/app.ts',
        type: 'file',
        added: 22,
        removed: 10,
        growth: 12,
        churn: 32,
        modifications: 2,
      },
    ]);
  });

  it('computes file metrics with per-commit cumulative series', async () => {
    const { status, body } = await get<MetricsBody>('/metrics?path=src/lib/deep/helper.ts');
    expect(status).toBe(200);
    expect(body.metrics.type).toBe('file');
    expect(body.metrics.totals).toEqual({ added: 5, removed: 0, growth: 5, churn: 5 });
    expect(body.metrics.modifications).toBe(1);
    expect(body.metrics.timeseries).toHaveLength(1);
  });

  it('rejects unknown paths with a clear error', async () => {
    const { status, body } = await get<{ error: string }>('/metrics?path=nope/missing.txt');
    expect(status).toBe(400);
    expect(body.error).toContain('nope/missing.txt');
  });

  it('scopes the commit list to a path, newest first', async () => {
    const { status, body } = await get<CommitsBody>('/commits?path=src/lib');
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.commits.map((c) => c.subject)).toEqual(['add deep helper', 'rewrite app, add util']);
    expect(body.commits[0]).toMatchObject({ authorName: 'Alice', added: 5, removed: 0 });
    expect(body.commits[1]).toMatchObject({ authorName: 'Bob', added: 4, removed: 0 });
  });

  it('paginates the full commit list newest first', async () => {
    const page1 = await get<CommitsBody>('/commits?limit=2');
    expect(page1.body.total).toBe(3);
    expect(page1.body.commits.map((c) => c.subject)).toEqual([
      'add deep helper',
      'rewrite app, add util',
    ]);

    const page2 = await get<CommitsBody>('/commits?limit=2&offset=2');
    expect(page2.body.total).toBe(3);
    expect(page2.body.commits.map((c) => c.subject)).toEqual(['add app and readme']);
    expect(page2.body.commits[0].added).toBe(13); // app.ts 10 + README 3

    const beyond = await get<CommitsBody>('/commits?limit=2&offset=99');
    expect(beyond.body.commits).toEqual([]);
  });

  it('applies the default limit and caps the requested limit', async () => {
    const { status, body } = await get<CommitsBody>('/commits?limit=99999');
    expect(status).toBe(200);
    expect(body.commits.length).toBe(3); // capped at MAX_COMMIT_LIMIT, total is 3
  });

  it('scopes summary metrics to a time range', async () => {
    // 2024-02-01T00:00:00Z .. 2024-03-01T00:00:00Z selects only c2
    const { status, body } = await get<SummaryBody>('/summary?from=1706745600&to=1709251200');
    expect(status).toBe(200);
    expect(body.summary.commitCount).toBe(1);
    expect(body.summary.totals).toEqual({ added: 16, removed: 10, growth: 6, churn: 26 });
    expect(body.summary.modifications).toBe(1);
    expect(body.summary.frequency).toBe(1);
    expect(body.summary.churnRate).toBe(26);
  });

  it('scopes metrics to an author', async () => {
    const author = encodeURIComponent('Alice <alice@example.com>');
    const { status, body } = await get<MetricsBody>(`/metrics?path=src&author=${author}`);
    expect(status).toBe(200);
    expect(body.metrics.totals).toEqual({ added: 15, removed: 0, growth: 15, churn: 15 });
    expect(body.metrics.modifications).toBe(2);
    expect(body.metrics.commitSetSize).toBe(2);
    expect(body.metrics.frequency).toBe(1);
    expect(body.metrics.churnRate).toBe(7.5);
  });

  it('resolves a manual commit selection on the metrics endpoint', async () => {
    const newest = await get<CommitsBody>('/commits?limit=1');
    const hash = newest.body.commits[0].hash; // c3
    const { status, body } = await get<MetricsBody>(`/metrics?commits=${hash}`);
    expect(status).toBe(200);
    expect(body.metrics.totals).toEqual({ added: 5, removed: 0, growth: 5, churn: 5 });
    expect(body.metrics.commitSetSize).toBe(1);
    expect(body.metrics.modifications).toBe(1);
  });

  it('rejects unknown commit hashes with a clear error', async () => {
    const { status, body } = await get<{ error: string }>('/summary?commits=ffffffffffffffff');
    expect(status).toBe(400);
    expect(body.error).toContain('Unknown commit hash');
  });

  it('scopes the commit list to an author', async () => {
    const author = encodeURIComponent('Bob <bob@example.com>');
    const { status, body } = await get<CommitsBody>(`/commits?author=${author}`);
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.commits[0]).toMatchObject({ authorName: 'Bob', subject: 'rewrite app, add util' });
  });

  it('lists authors busiest-first with canonical filter keys', async () => {
    const { status, body } = await get<{
      authors: Array<{ name: string; email: string; key: string; commitCount: number }>;
    }>('/authors');
    expect(status).toBe(200);
    expect(body.authors).toEqual([
      { name: 'Alice', email: 'alice@example.com', key: 'Alice <alice@example.com>', commitCount: 2 },
      { name: 'Bob', email: 'bob@example.com', key: 'Bob <bob@example.com>', commitCount: 1 },
    ]);
  });
});
