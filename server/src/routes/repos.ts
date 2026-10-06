import fs from 'node:fs';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { dirs, ensureDataDirs, getRepo, listRepos, removeRepo } from '../services/repoStore.js';
import { IngestError, ingestZip, sanitizeRepoName } from '../services/ingest.js';
import { getRepoSummary } from '../services/summary.js';
import type { RepoPublic } from '../types.js';

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
  const repo = getRepo(req.params.id);
  if (!repo) {
    res.status(404).json({ error: 'Repository not found.' });
    return;
  }
  const summary = await getRepoSummary(repo);
  res.json({ repo: toPublic(repo), summary });
}));

reposRouter.delete('/:id', (req, res) => {
  const removed = removeRepo(req.params.id);
  if (!removed) {
    res.status(404).json({ error: 'Repository not found.' });
    return;
  }
  res.status(204).send();
});
