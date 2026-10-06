import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearAuthorMerges, distinctIdentities, upsertAuthorMerge } from '../src/services/authorMerges.js';
import { clearHistoryCacheForTests, getHistory, getMergedHistory } from '../src/services/historyCache.js';
import { dirs, newId, registerRepo, removeRepo } from '../src/services/repoStore.js';
import { createFixtureRepo, lines } from './helpers/fixtureRepo.js';

const cleanupIds: string[] = [];

afterEach(() => {
  clearHistoryCacheForTests();
  for (const id of cleanupIds.splice(0)) removeRepo(id);
});

describe('history cache', () => {
  it('persists parsed history by repo and HEAD', async () => {
    const fixture = createFixtureRepo([
      {
        message: 'add readme',
        author: { name: 'Alice', email: 'alice@example.com' },
        date: '2024-01-01T12:00:00Z',
        files: [{ path: 'README.md', content: lines(1, 2) }],
      },
    ]);
    const repoId = newId();
    cleanupIds.push(repoId);
    const repo = registerRepo(repoId, 'cache-fixture', fixture.path, { source: 'zip' });

    const first = await getHistory(repo);
    const head = execFileSync('git', ['-C', fixture.path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const cacheFile = path.join(dirs.cacheDir, `${repoId}-${head}.json`);
    expect(fs.existsSync(cacheFile)).toBe(true);

    clearHistoryCacheForTests();
    const second = await getHistory(repo);
    expect(second.commits.map((commit) => commit.hash)).toEqual(first.commits.map((commit) => commit.hash));
  });

  it('invalidates merged history when the merge map changes', async () => {
    const fixture = createFixtureRepo([
      {
        message: 'alice commit',
        author: { name: 'Alice', email: 'alice@example.com' },
        date: '2024-01-01T12:00:00Z',
        files: [{ path: 'a.txt', content: lines(1, 1) }],
      },
      {
        message: 'bob commit',
        author: { name: 'Bob', email: 'bob@example.com' },
        date: '2024-01-02T12:00:00Z',
        files: [{ path: 'b.txt', content: lines(1, 1) }],
      },
    ]);
    const repoId = newId();
    cleanupIds.push(repoId);
    const repo = registerRepo(repoId, 'merge-cache-fixture', fixture.path, { source: 'zip' });

    const before = await getMergedHistory(repo);
    expect(before.commits.map((commit) => commit.authorName)).toEqual(['Alice', 'Bob']);

    upsertAuthorMerge(
      repoId,
      distinctIdentities(before.commits),
      'Alice <alice@example.com>',
      ['Bob <bob@example.com>'],
    );

    const after = await getMergedHistory(repo);
    expect(after.commits.map((commit) => commit.authorName)).toEqual(['Alice', 'Alice']);
    clearAuthorMerges(repoId);
  });
});
