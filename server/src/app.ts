import express, { ErrorRequestHandler, Express } from 'express';
import cors from 'cors';
import { MulterError } from 'multer';
import { reposRouter } from './routes/repos.js';
import { IngestError } from './services/ingest.js';
import { CommitSetError } from './services/commitSet.js';
import { AuthorMergeError } from './services/authorMerges.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/repos', reposRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    let status = 500;
    if (err instanceof IngestError) status = err.status;
    else if (err instanceof CommitSetError || err instanceof AuthorMergeError) status = 400;
    else if (err instanceof MulterError) status = 400;
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (status >= 500) {
      console.error(err);
    }
    res.status(status).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}
