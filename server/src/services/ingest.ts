import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirs, ensureDataDirs, newId, registerRepo } from './repoStore.js';
import type { RepoMeta } from '../types.js';

const exec = promisify(execFile);

export class IngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'IngestError';
    this.status = status;
  }
}

/**
 * Ingest an uploaded repository zip: validate it, extract it to temporary
 * storage, locate and verify the .git repository inside, then move it to its
 * permanent home and register it.
 */
export async function ingestZip(zipPath: string, displayName: string): Promise<RepoMeta> {
  ensureDataDirs();
  const id = newId();
  const tmpDir = path.join(dirs.tmpDir, id);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch {
      throw new IngestError('Uploaded file is not a valid zip archive.');
    }

    const entries = zip.getEntries();
    if (entries.length === 0) {
      throw new IngestError('The uploaded zip archive is empty.');
    }

    // Zip-slip guard: refuse entries that would extract outside the temp dir.
    const resolvedTmp = path.resolve(tmpDir);
    for (const entry of entries) {
      const target = path.resolve(tmpDir, entry.entryName);
      if (target !== resolvedTmp && !target.startsWith(resolvedTmp + path.sep)) {
        throw new IngestError(`Unsafe path in zip archive: ${entry.entryName}`);
      }
    }

    zip.extractAllTo(tmpDir, true);

    const located = locateGitRoot(tmpDir);
    if (!located) {
      throw new IngestError(
        'No .git found in the archive. Upload a zip of the repository including its .git folder.',
      );
    }

    try {
      await exec('git', ['-C', located, 'rev-parse', '--git-dir']);
    } catch {
      throw new IngestError('The .git entry in the archive is not a valid git repository.');
    }

    const finalDir = path.join(dirs.reposDir, id);
    fs.renameSync(located, finalDir);
    return registerRepo(id, displayName, finalDir, { source: 'zip' });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Find the repository root inside an extracted archive. Accepts `.git` at the
 * archive root or one level down (common when the repo was zipped as a folder).
 * `.git` may be a directory or a file (worktree/submodule style).
 */
function locateGitRoot(dir: string): string | null {
  if (fs.existsSync(path.join(dir, '.git'))) return dir;
  const children = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const child of children) {
    const candidate = path.join(dir, child.name);
    if (fs.existsSync(path.join(candidate, '.git'))) return candidate;
  }
  return null;
}

export function sanitizeRepoName(rawName: string): string {
  const base = rawName.replace(/\.zip$/i, '');
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 80) || 'uploaded-repo';
}
