import fs from 'node:fs';
import path from 'node:path';
import type { CommitRecord } from '../types.js';
import { authorKey } from './commitSet.js';
import type { HistoryData } from './historyCache.js';
import { dirs, ensureDataDirs } from './repoStore.js';

export interface AuthorIdentity {
  name: string;
  email: string;
  key: string;
}

export interface AuthorMerge {
  canonical: AuthorIdentity;
  aliases: AuthorIdentity[];
}

export class AuthorMergeError extends Error {}

interface PersistedMerges {
  merges: AuthorMerge[];
}

export function identity(name: string, email: string): AuthorIdentity {
  return { name, email, key: authorKey(name, email) };
}

export function identityFromCommit(commit: CommitRecord): AuthorIdentity {
  return identity(commit.authorName, commit.authorEmail);
}

function mergeFile(repoId: string): string {
  return path.join(dirs.authorMergesDir, `${repoId}.json`);
}

export function getAuthorMergeVersion(repoId: string): string {
  const file = mergeFile(repoId);
  if (!fs.existsSync(file)) return 'none';
  const stat = fs.statSync(file);
  return `${stat.mtimeMs}:${stat.size}`;
}

export function loadAuthorMerges(repoId: string): AuthorMerge[] {
  const file = mergeFile(repoId);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedMerges;
  return Array.isArray(parsed.merges) ? parsed.merges : [];
}

function saveAuthorMerges(repoId: string, merges: AuthorMerge[]): void {
  ensureDataDirs();
  fs.writeFileSync(mergeFile(repoId), JSON.stringify({ merges }, null, 2));
}

export function clearAuthorMerges(repoId: string): void {
  fs.rmSync(mergeFile(repoId), { force: true });
}

export function distinctIdentities(commits: CommitRecord[]): AuthorIdentity[] {
  const authors = new Map<string, AuthorIdentity>();
  for (const commit of commits) {
    const item = identityFromCommit(commit);
    authors.set(item.key, item);
  }
  return [...authors.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

export function upsertAuthorMerge(
  repoId: string,
  baseIdentities: AuthorIdentity[],
  canonicalKey: string,
  aliasKeys: string[],
): AuthorMerge[] {
  const identityByKey = new Map(baseIdentities.map((item) => [item.key, item]));
  const requested = new Set([canonicalKey, ...aliasKeys].map((key) => key.trim()).filter(Boolean));
  if (requested.size < 2) throw new AuthorMergeError('Select at least two identities to merge.');
  for (const key of requested) {
    if (!identityByKey.has(key)) throw new AuthorMergeError(`Unknown author identity: ${key}`);
  }

  const existing = loadAuthorMerges(repoId);
  const mergedKeys = new Set(requested);
  const remaining: AuthorMerge[] = [];
  for (const merge of existing) {
    const keys = [merge.canonical.key, ...merge.aliases.map((alias) => alias.key)];
    if (keys.some((key) => requested.has(key))) {
      for (const key of keys) mergedKeys.add(key);
      identityByKey.set(merge.canonical.key, merge.canonical);
      for (const alias of merge.aliases) identityByKey.set(alias.key, alias);
    } else {
      remaining.push(merge);
    }
  }

  const canonical = identityByKey.get(canonicalKey);
  if (!canonical) throw new AuthorMergeError(`Unknown author identity: ${canonicalKey}`);
  const aliases = [...mergedKeys]
    .filter((key) => key !== canonicalKey)
    .map((key) => identityByKey.get(key))
    .filter((item): item is AuthorIdentity => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));

  const next = [...remaining, { canonical, aliases }];
  saveAuthorMerges(repoId, next);
  return next;
}

export function applyAuthorMerges(history: HistoryData, merges: AuthorMerge[]): HistoryData {
  if (merges.length === 0) return history;
  const canonicalByKey = new Map<string, AuthorIdentity>();
  for (const merge of merges) {
    canonicalByKey.set(merge.canonical.key, merge.canonical);
    for (const alias of merge.aliases) canonicalByKey.set(alias.key, merge.canonical);
  }
  const commits = history.commits.map((commit) => {
    const canonical = canonicalByKey.get(authorKey(commit.authorName, commit.authorEmail));
    return canonical
      ? { ...commit, authorName: canonical.name, authorEmail: canonical.email }
      : commit;
  });
  return { ...history, commits };
}
