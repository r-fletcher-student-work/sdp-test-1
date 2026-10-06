import { spawn } from 'node:child_process';
import type { CommitRecord, FileChange } from '../types.js';

// %x01 marks a new record; %x1f separates header fields. %aN/%aE apply .mailmap.
const LOG_FORMAT = '%x01%H%x1f%P%x1f%aN%x1f%aE%x1f%ct%x1f%s';

/**
 * Extract the non-merge history reachable from HEAD as a chronological list of
 * commits with per-file added/removed counts.
 *
 * - merge commits are excluded (--no-merges)
 * - .mailmap identities are applied (%aN/%aE + --use-mailmap)
 * - binary files are skipped (numstat reports "-" for them)
 * - renames (50% threshold) are attributed to the new path
 * - deletions appear as removed lines on the deleted path
 */
export async function extractHistory(repoPath: string, revisionRange?: string): Promise<CommitRecord[]> {
  const args = [
    '-c',
    'core.quotepath=false',
    '-C',
    repoPath,
    'log',
    '--no-merges',
    '--use-mailmap',
    '--numstat',
    '--find-renames=50%',
    '--date-order',
    `--pretty=format:${LOG_FORMAT}`,
  ];
  if (revisionRange) args.push(revisionRange);

  const records: CommitRecord[] = [];
  let current: CommitRecord | null = null;
  let pending = '';

  const consumeLine = (line: string): void => {
    if (line.startsWith('\u0001')) {
      if (current) records.push(current);
      current = parseHeader(line.slice(1));
    } else if (current) {
      const change = parseNumstatLine(line);
      if (change) current.changes.push(change);
    }
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (pending) consumeLine(pending);
      if (current) records.push(current);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git log exited with status ${code ?? 'unknown'}`));
    });
  });

  records.reverse();
  return records;
}

function parseHeader(payload: string): CommitRecord {
  const [hash = '', parents = '', authorName = '', authorEmail = '', committerDate = '', subject = ''] =
    payload.split('\u001f');
  return {
    hash,
    parent: parents ? parents.split(' ')[0] : null,
    authorName,
    authorEmail,
    committerDate: Number(committerDate),
    subject,
    changes: [],
  };
}

export function parseNumstatLine(line: string): FileChange | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('\t');
  if (parts.length < 3) return null;
  const [addedRaw, removedRaw] = parts;
  if (addedRaw === '-' || removedRaw === '-') return null; // binary file
  const added = Number(addedRaw);
  const removed = Number(removedRaw);
  if (!Number.isFinite(added) || !Number.isFinite(removed)) return null;
  return { path: resolveRenamePath(parts.slice(2).join('\t')), added, removed };
}

/**
 * Git renders renames as "old => new" or "dir/{old => new}/suffix"; the
 * change counts belong to the destination path.
 */
export function resolveRenamePath(raw: string): string {
  const idx = raw.indexOf(' => ');
  if (idx === -1) return raw;
  return raw.slice(idx + 4).replace('}', '').trim();
}
