import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { dirs, ensureDataDirs, newId, registerRepo } from './repoStore.js';
import { IngestError, sanitizeRepoName } from './ingest.js';
import type { RepoPublic } from '../types.js';

export type CloneJobStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface CloneJobPublic {
  id: string;
  url: string;
  status: CloneJobStatus;
  message: string;
  repo?: RepoPublic;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

interface CloneJob extends CloneJobPublic {
  repo?: RepoPublic;
}

const jobs = new Map<string, CloneJob>();
const CLONE_TIMEOUT_MS = Number.parseInt(process.env.RAT_CLONE_TIMEOUT_MS ?? '', 10) || 30 * 60 * 1000;
const MAX_PROGRESS_MESSAGE_LENGTH = 240;

function toPublicRepo(entry: { id: string; name: string; addedAt: string; source?: 'zip' | 'url'; sourceUrl?: string }): RepoPublic {
  return {
    id: entry.id,
    name: entry.name,
    addedAt: entry.addedAt,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
  };
}

export function validateCloneUrl(rawUrl: unknown): string {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!value) throw new IngestError('Enter a repository URL.');
  if (value.length > 2048) throw new IngestError('Repository URL is too long.');
  if (value.startsWith('-')) throw new IngestError('Repository URL cannot start with a dash.');
  if (/\s/.test(value)) throw new IngestError('Repository URL cannot contain spaces.');

  try {
    const parsed = new URL(value);
    if (['http:', 'https:', 'ssh:', 'git:', 'file:'].includes(parsed.protocol)) return value;
  } catch {
    // Continue to scp-style validation below.
  }

  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/.test(value)) return value;
  throw new IngestError('Use an http(s), ssh, git, file, or git@host:path URL.');
}

function displayNameFromUrl(url: string): string {
  const withoutSlash = url.replace(/\/+$/, '');
  const tail = withoutSlash.split(/[/:]/).filter(Boolean).pop() ?? 'cloned-repo';
  return sanitizeRepoName(tail.replace(/\.git$/i, ''));
}

function updateJob(id: string, patch: Partial<CloneJob>): void {
  const current = jobs.get(id);
  if (!current) return;
  jobs.set(id, { ...current, ...patch });
}

function normalizeProgress(chunk: Buffer): string | null {
  const line = chunk
    .toString('utf8')
    .split(/[\r\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  if (!line) return null;
  return line.slice(0, MAX_PROGRESS_MESSAGE_LENGTH);
}

async function verifyGitRepo(repoPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['-C', repoPath, 'rev-parse', '--git-dir'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || 'Cloned repository is not a valid git repo.'));
    });
  });
}

async function runCloneJob(jobId: string, url: string): Promise<void> {
  ensureDataDirs();
  const tmpDir = path.join(dirs.tmpDir, `clone-${jobId}`);
  const finalDir = path.join(dirs.reposDir, jobId);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(finalDir, { recursive: true, force: true });
  updateJob(jobId, { status: 'running', message: 'Cloning repository...' });

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('git', ['clone', '--progress', '--', url, tmpDir], {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new IngestError('Clone timed out.', 408));
      }, CLONE_TIMEOUT_MS);
      let stderr = '';

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
        const message = normalizeProgress(chunk);
        if (message) updateJob(jobId, { message });
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new IngestError(stderr.trim().split(/\r?\n/).filter(Boolean).pop() ?? 'Clone failed.'));
      });
    });

    updateJob(jobId, { message: 'Validating repository...' });
    await verifyGitRepo(tmpDir);
    fs.renameSync(tmpDir, finalDir);
    const meta = registerRepo(jobId, displayNameFromUrl(url), finalDir, { source: 'url', sourceUrl: url });
    updateJob(jobId, {
      status: 'complete',
      message: 'Clone complete.',
      repo: toPublicRepo(meta),
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Clone failed.';
    updateJob(jobId, {
      status: 'failed',
      message,
      error: message,
      finishedAt: new Date().toISOString(),
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(finalDir, { recursive: true, force: true });
  }
}

export function startCloneJob(rawUrl: unknown): CloneJobPublic {
  const url = validateCloneUrl(rawUrl);
  const id = newId();
  const job: CloneJob = {
    id,
    url,
    status: 'queued',
    message: 'Clone queued.',
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  setImmediate(() => {
    void runCloneJob(id, url);
  });
  return job;
}

export function getCloneJob(id: string): CloneJobPublic | undefined {
  return jobs.get(id);
}

export function clearCloneJobsForTests(): void {
  jobs.clear();
}
