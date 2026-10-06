import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractHistory } from '../src/services/gitLog.js';
import { createFixtureRepo, lines, type FixtureRepo } from './helpers/fixtureRepo.js';
import type { CommitRecord } from '../src/types.js';

let fixture: FixtureRepo;
let commits: CommitRecord[];

beforeAll(async () => {
  fixture = createFixtureRepo([
    {
      message: 'add fileA',
      author: { name: 'Alice', email: 'alice@example.com' },
      date: '2024-01-01T00:00:00+00:00',
      files: [{ path: 'fileA.txt', content: lines(1, 10) }],
    },
    {
      message: 'extend fileA, add binary and nested text file',
      author: { name: 'Bob', email: 'bob@example.com' },
      date: '2024-01-02T00:00:00+00:00',
      files: [
        { path: 'fileA.txt', content: lines(1, 15) },
        { path: 'binary.bin', content: Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff, 0xfe]) },
        { path: 'nested/deep.txt', content: 'd1\nd2\nd3\nd4\n' },
      ],
    },
    {
      message: 'rename fileA to fileB and edit it',
      author: { name: 'Alice', email: 'alice@example.com' },
      date: '2024-01-03T00:00:00+00:00',
      moves: [{ from: 'fileA.txt', to: 'fileB.txt' }],
      files: [{ path: 'fileB.txt', content: lines(1, 13) + 'alpha\nbeta\ngamma\n' }],
    },
    {
      message: 'pure rename fileB to fileC',
      author: { name: 'Carol', email: 'carol@example.com' },
      date: '2024-01-04T00:00:00+00:00',
      moves: [{ from: 'fileB.txt', to: 'fileC.txt' }],
    },
    {
      message: 'delete binary and nested text file',
      author: { name: 'Bob', email: 'bob@example.com' },
      date: '2024-01-05T00:00:00+00:00',
      deletions: ['binary.bin', 'nested/deep.txt'],
    },
  ]);
  commits = await extractHistory(fixture.path);
});

afterAll(() => {
  fixture.cleanup();
});

describe('extractHistory', () => {
  it('returns non-merge commits chronologically with linked parents', () => {
    expect(commits).toHaveLength(5);
    expect(commits[0].parent).toBeNull();
    for (let i = 1; i < commits.length; i++) {
      expect(commits[i].parent).toBe(commits[i - 1].hash);
      expect(commits[i].committerDate).toBeGreaterThan(commits[i - 1].committerDate);
    }
  });

  it('records author identity and committer date', () => {
    expect(commits[0].authorName).toBe('Alice');
    expect(commits[0].authorEmail).toBe('alice@example.com');
    expect(commits[1].authorName).toBe('Bob');
    expect(commits[1].committerDate).toBe(Date.parse('2024-01-02T00:00:00+00:00') / 1000);
  });

  it('counts text edits and skips binary files', () => {
    expect(commits[1].changes).toEqual([
      { path: 'fileA.txt', added: 5, removed: 0 },
      { path: 'nested/deep.txt', added: 4, removed: 0 },
    ]);
  });

  it('attributes rename+edit changes to the new path', () => {
    expect(commits[2].changes).toEqual([{ path: 'fileB.txt', added: 3, removed: 2 }]);
  });

  it('records pure renames with no line changes on the new path', () => {
    expect(commits[3].changes).toEqual([{ path: 'fileC.txt', added: 0, removed: 0 }]);
  });

  it('records text deletions as removed lines and skips binary deletions', () => {
    expect(commits[4].changes).toEqual([{ path: 'nested/deep.txt', added: 0, removed: 4 }]);
  });
});
