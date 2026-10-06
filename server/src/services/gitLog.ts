import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommitRecord, FileChange } from '../types.js';

const exec = promisify(execFile);

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
export async function extractHistory(repoPath: string): Promise<CommitRecord[]> {
  const { stdout } = await exec(
    'git',
    [
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
    ],
    { maxBuffer: 512 * 1024 * 1024 },
  );

  const records: CommitRecord[] = [];
  let current: CommitRecord | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('\u0001')) {
      if (current) records.push(current);
      current = parseHeader(line.slice(1));
    } else if (current) {
      const change = parseNumstatLine(line);
      if (change) current.changes.push(change);
    }
  }
  if (current) records.push(current);
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
