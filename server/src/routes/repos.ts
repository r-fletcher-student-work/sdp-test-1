import fs from 'node:fs';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { dirs, ensureDataDirs, getRepo, listRepos, removeRepo } from '../services/repoStore.js';
import { IngestError, ingestZip, sanitizeRepoName } from '../services/ingest.js';
import { getHistory, getMergedHistory } from '../services/historyCache.js';
import { CommitSetError, resolveCommitSet, type CommitSetFilter } from '../services/commitSet.js';
import {
  applyAuthorMerges,
  clearAuthorMerges,
  distinctIdentities,
  loadAuthorMerges,
  upsertAuthorMerge,
} from '../services/authorMerges.js';
import { listAuthors } from '../services/authors.js';
import { commitDeltas, computePathMetrics, normalizePath, resolvePathType, type PathType } from '../services/pathMetrics.js';
import { buildTree } from '../services/tree.js';
import { getRepoSummary } from '../services/summary.js';
import type { RepoMeta, RepoPublic } from '../types.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDataDirs();
      cb(null, dirs.uploadsDir);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GiB
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Express 4 does not forward rejected promises, so wrap async handlers.
const asyncHandler =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };

export const reposRouter = Router();

function toPublic(entry: { id: string; name: string; addedAt: string }): RepoPublic {
  return { id: entry.id, name: entry.name, addedAt: entry.addedAt };
}

/** Resolve :id to a repo, responding 404 and returning null when missing. */
function requireRepo(req: Request, res: Response): RepoMeta | null {
  const repo = getRepo(req.params.id);
  if (!repo) {
    res.status(404).json({ error: 'Repository not found.' });
    return null;
  }
  return repo;
}

function parseIntParam(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffsetParam(value: unknown): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const DEFAULT_COMMIT_LIMIT = 100;
const MAX_COMMIT_LIMIT = 500;

/** Upper bound on manually selected commits per request (URL length guard). */
const MAX_SELECTED_COMMITS = 5000;

/**
 * Commit-set filters from the query string: `from`/`to` (unix seconds),
 * `commits` (comma-separated full hashes or unique prefixes), and `author`
 * ('Name <email>'). Malformed numbers are ignored; bad hash selections throw
 * CommitSetError (mapped to 400 by the error handler).
 */
function parseCommitSetFilter(req: Request): CommitSetFilter {
  const filter: CommitSetFilter = {};
  const from = Number.parseInt(String(req.query.from ?? ''), 10);
  if (Number.isFinite(from) && from >= 0) filter.from = from;
  const to = Number.parseInt(String(req.query.to ?? ''), 10);
  if (Number.isFinite(to) && to >= 0) filter.to = to;
  const rawCommits = typeof req.query.commits === 'string' ? req.query.commits : '';
  const hashes = rawCommits.split(',').map((hash) => hash.trim()).filter(Boolean);
  if (hashes.length > MAX_SELECTED_COMMITS) {
    throw new CommitSetError(
      `Too many selected commits (${hashes.length}); the maximum is ${MAX_SELECTED_COMMITS}.`,
    );
  }
  if (hashes.length > 0) filter.hashes = hashes;
  const author = typeof req.query.author === 'string' ? req.query.author.trim() : '';
  if (author) filter.author = author;
  return filter;
}

reposRouter.get('/', (_req, res) => {
  res.json(listRepos().map(toPublic));
});

reposRouter.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.file) {
        throw new IngestError('No file uploaded. Attach the repository zip in the "file" field.');
      }
      const name = sanitizeRepoName(req.file.originalname || 'uploaded-repo');
      const meta = await ingestZip(req.file.path, name);
      res.status(201).json(toPublic(meta));
    } finally {
      if (req.file) {
        await fs.promises.unlink(req.file.path).catch(() => undefined);
      }
    }
  }),
);

reposRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  const repo = requireRepo(req, res);
  if (!repo) return;
  const summary = await getRepoSummary(repo, parseCommitSetFilter(req));
  res.json({ repo: toPublic(repo), summary });
}));

reposRouter.get('/:id/authors', asyncHandler(async (req, res) => {
  const repo = requireRepo(req, res);
  if (!repo) return;
  const rawHistory = await getHistory(repo);
  const merges = loadAuthorMerges(repo.id);
  const history = applyAuthorMerges(rawHistory, merges);
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  const authors = listAuthors(
    history,
    parseCommitSetFilter(req),
    rawPath,
    distinctIdentities(rawHistory.commits),
    merges,
  );
  res.json({ repo: toPublic(repo), ...authors });
}));

reposRouter.post('/:id/authors/merge', asyncHandler(async (req, res) => {
  const repo = requireRepo(req, res);
  if (!repo) return;
  const rawHistory = await getHistory(repo);
  const body = req.body as { canonical?: unknown; aliases?: unknown[]; clear?: unknown };
  if (body.clear === true) {
    clearAuthorMerges(repo.id);
  } else {
    const canonical = typeof body.canonical === 'string' ? body.canonical : '';
    const aliases = Array.isArray(body.aliases)
      ? body.aliases.filter((item): item is string => typeof item === 'string')
      : [];
    upsertAuthorMerge(repo.id, distinctIdentities(rawHistory.commits), canonical, aliases);
  }
  const merges = loadAuthorMerges(repo.id);
  const history = applyAuthorMerges(rawHistory, merges);
  const authors = listAuthors(history, {}, '', distinctIdentities(rawHistory.commits), merges);
  res.json({ repo: toPublic(repo), ...authors });
}));

reposRouter.get('/:id/tree', asyncHandler(async (req, res) => {
  const repo = requireRepo(req, res);
  if (!repo) return;
  const history = await getMergedHistory(repo);
  res.json({ repo: toPublic(repo), tree: buildTree(history, repo.name) });
}));

reposRouter.get('/:id/metrics', asyncHandler(async (req, res) => {
  const repo = requireRepo(req, res);
  if (!repo) return;
  const history = await getMergedHistory(repo);
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  const metrics = computePathMetrics(history, rawPath, parseCommitSetFilter(req));
  if (!metrics) {
    res.status(400).json({ error: `Path not found in repository history: ${rawPath}` });
    return;
  }
  res.json({ repo: toPublic(repo), metrics });
}));

reposRouter.get('/:id/commits', asyncHandler(async (req, res) => {
  const repo = requireRepo(req, res);
  if (!repo) return;
  const history = await getMergedHistory(repo);

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  const path = normalizePath(rawPath);
  const type: PathType | null = rawPath === '' ? 'dir' : resolvePathType(history, path);
  if (!type) {
    res.status(400).json({ error: `Path not found in repository history: ${rawPath}` });
    return;
  }

  const limit = parseIntParam(req.query.limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT);
  const offset = parseOffsetParam(req.query.offset);

  const filter = parseCommitSetFilter(req);
  const deltas = commitDeltas(history, path, type, resolveCommitSet(history, filter));
  const total = deltas.length;
  // Newest-first page: offsets count back from the newest commit.
  const start = Math.max(0, total - offset - limit);
  const end = Math.max(0, total - offset);
  const commits = deltas.slice(start, end).reverse().map(({ commit, added, removed }) => ({
    hash: commit.hash,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    committerDate: commit.committerDate,
    subject: commit.subject,
    added,
    removed,
  }));
  res.json({ total, commits });
}));

reposRouter.delete('/:id', (req, res) => {
  const removed = removeRepo(req.params.id);
  if (!removed) {
    res.status(404).json({ error: 'Repository not found.' });
    return;
  }
  res.status(204).send();
});
