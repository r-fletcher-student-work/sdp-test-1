export interface FileChange {
  path: string;
  added: number;
  removed: number;
}

export interface CommitRecord {
  hash: string;
  /** null for the initial commit (empty commit h∅) */
  parent: string | null;
  authorName: string;
  authorEmail: string;
  /** committer date, unix seconds */
  committerDate: number;
  subject: string;
  /** changed files; binary files excluded; renames attributed to the new path */
  changes: FileChange[];
}

export type RepoSource = 'zip' | 'url';

export interface RepoMeta {
  id: string;
  name: string;
  /** absolute path to the repository on disk */
  path: string;
  addedAt: string;
  source?: RepoSource;
  sourceUrl?: string;
}

/** Public (client-facing) repo representation — no filesystem paths. */
export interface RepoPublic {
  id: string;
  name: string;
  addedAt: string;
  source?: RepoSource;
  sourceUrl?: string;
}
