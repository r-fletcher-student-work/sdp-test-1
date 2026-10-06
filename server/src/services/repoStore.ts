import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { RepoMeta } from '../types.js';

// serverRoot is `server/` whether running from src (tsx) or dist (node).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(serverRoot, 'data');
const reposDir = path.join(dataDir, 'repos');
const tmpDir = path.join(dataDir, 'tmp');
const uploadsDir = path.join(dataDir, 'uploads');
const authorMergesDir = path.join(dataDir, 'author-merges');
const registryFile = path.join(dataDir, 'repos.json');

export const dirs = { dataDir, reposDir, tmpDir, uploadsDir, authorMergesDir };

export function ensureDataDirs(): void {
  for (const dir of [dataDir, reposDir, tmpDir, uploadsDir, authorMergesDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function newId(): string {
  return randomUUID();
}

export function listRepos(): RepoMeta[] {
  if (!fs.existsSync(registryFile)) return [];
  const raw = JSON.parse(fs.readFileSync(registryFile, 'utf8')) as RepoMeta[];
  return Array.isArray(raw) ? raw : [];
}

function saveRegistry(repos: RepoMeta[]): void {
  ensureDataDirs();
  fs.writeFileSync(registryFile, JSON.stringify(repos, null, 2));
}

export function registerRepo(
  id: string,
  name: string,
  repoPath: string,
  metadata: Pick<RepoMeta, 'source' | 'sourceUrl'> = {},
): RepoMeta {
  const entry: RepoMeta = { id, name, path: repoPath, addedAt: new Date().toISOString(), ...metadata };
  saveRegistry([...listRepos(), entry]);
  return entry;
}

export function getRepo(id: string): RepoMeta | undefined {
  return listRepos().find((r) => r.id === id);
}

export function removeRepo(id: string): boolean {
  const repos = listRepos();
  const entry = repos.find((r) => r.id === id);
  if (!entry) return false;
  fs.rmSync(entry.path, { recursive: true, force: true });
  fs.rmSync(path.join(authorMergesDir, `${id}.json`), { force: true });
  saveRegistry(repos.filter((r) => r.id !== id));
  return true;
}
