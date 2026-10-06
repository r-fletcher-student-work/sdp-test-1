import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dirs, ensureDataDirs, newId } from '../../src/services/repoStore.js';

export interface FixtureFileSpec {
  path: string;
  content: string | Buffer;
}

export interface FixtureCommitSpec {
  message: string;
  author: { name: string; email: string };
  /** ISO date with offset; applied to both author and committer dates */
  date: string;
  files?: FixtureFileSpec[];
  deletions?: string[];
  moves?: Array<{ from: string; to: string }>;
}

export interface FixtureRepo {
  path: string;
  cleanup(): void;
}

/**
 * Create a small deterministic git repository for parser/metric tests.
 * Repos live under server/data/tmp so they stay inside the workspace.
 */
export function createFixtureRepo(specs: FixtureCommitSpec[]): FixtureRepo {
  ensureDataDirs();
  const repoPath = path.join(dirs.tmpDir, `fixture-${newId()}`);
  fs.mkdirSync(repoPath, { recursive: true });

  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', ['-C', repoPath, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', ...env },
    });

  git(['init', '-b', 'main']);

  for (const spec of specs) {
    for (const move of spec.moves ?? []) {
      fs.renameSync(path.join(repoPath, move.from), path.join(repoPath, move.to));
    }
    for (const del of spec.deletions ?? []) {
      fs.rmSync(path.join(repoPath, del));
    }
    for (const file of spec.files ?? []) {
      const dest = path.join(repoPath, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
    }
    git(['add', '-A']);
    git(
      ['-c', 'commit.gpgsign=false', 'commit', '-m', spec.message],
      {
        GIT_AUTHOR_NAME: spec.author.name,
        GIT_AUTHOR_EMAIL: spec.author.email,
        GIT_COMMITTER_NAME: spec.author.name,
        GIT_COMMITTER_EMAIL: spec.author.email,
        GIT_AUTHOR_DATE: spec.date,
        GIT_COMMITTER_DATE: spec.date,
      },
    );
  }

  return {
    path: repoPath,
    cleanup: () => fs.rmSync(repoPath, { recursive: true, force: true }),
  };
}

/** "lineN" lines from `from` to `to` inclusive, newline-terminated. */
export function lines(from: number, to: number): string {
  return (
    Array.from({ length: to - from + 1 }, (_, i) => `line${from + i}`).join('\n') + '\n'
  );
}
