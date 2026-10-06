import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearCloneJobsForTests, validateCloneUrl, type CloneJobPublic } from '../src/services/clone.js';
import { getRepo, removeRepo } from '../src/services/repoStore.js';
import { createFixtureRepo, lines } from './helpers/fixtureRepo.js';

const app = createApp();
const server = app.listen(0);
let base = '';

function baseUrl(): string {
  if (!base) {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to acquire a port for the test server');
    }
    base = `http://127.0.0.1:${address.port}`;
  }
  return base;
}

async function waitForJob(jobId: string): Promise<CloneJobPublic> {
  for (let i = 0; i < 60; i += 1) {
    const res = await fetch(`${baseUrl()}/api/repos/clone/${jobId}`);
    const job = (await res.json()) as CloneJobPublic;
    if (job.status === 'complete' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('clone job did not finish');
}

afterAll(() => {
  server.close();
  clearCloneJobsForTests();
});

describe('clone ingestion', () => {
  it('validates clone URLs before invoking git', () => {
    expect(validateCloneUrl('https://example.com/repo.git')).toBe('https://example.com/repo.git');
    expect(validateCloneUrl('git@example.com:org/repo.git')).toBe('git@example.com:org/repo.git');
    expect(() => validateCloneUrl('')).toThrow('Enter a repository URL.');
    expect(() => validateCloneUrl('--upload-pack=sh')).toThrow('dash');
    expect(() => validateCloneUrl('https://example.com/repo with spaces.git')).toThrow('spaces');
  });

  it('clones a repository URL as a background job and registers it', async () => {
    const fixture = createFixtureRepo([
      {
        message: 'initial commit',
        author: { name: 'Alice', email: 'alice@example.com' },
        date: '2024-01-01T12:00:00Z',
        files: [{ path: 'README.md', content: lines(1, 2) }],
      },
    ]);

    let clonedId: string | undefined;
    try {
      const start = await fetch(`${baseUrl()}/api/repos/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pathToFileURL(fixture.path).href }),
      });
      expect(start.status).toBe(202);
      const started = (await start.json()) as CloneJobPublic;
      expect(started.status).toBe('queued');

      const finished = await waitForJob(started.id);
      expect(finished.status).toBe('complete');
      expect(finished.repo).toMatchObject({ name: expect.stringContaining('fixture-'), source: 'url' });
      expect(finished.repo?.sourceUrl).toBe(pathToFileURL(fixture.path).href);

      clonedId = finished.repo?.id;
      expect(clonedId).toBeTruthy();
      expect(getRepo(clonedId ?? '')?.path).toContain(clonedId);

      const summary = await fetch(`${baseUrl()}/api/repos/${clonedId}/summary`);
      expect(summary.status).toBe(200);
      const body = (await summary.json()) as { summary: { commitCount: number; totals: { added: number } } };
      expect(body.summary.commitCount).toBe(1);
      expect(body.summary.totals.added).toBe(2);
    } finally {
      if (clonedId) removeRepo(clonedId);
      fixture.cleanup();
    }
  });

  it('rejects malformed clone requests clearly', async () => {
    const res = await fetch(`${baseUrl()}/api/repos/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not a url' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('spaces');
  });
});
