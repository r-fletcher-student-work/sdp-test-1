import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ErrorBanner } from './ErrorBanner';
import { fmtDate, fmtNumber } from '../lib/format';

const PAGE_SIZE = 100;

/**
 * Newest-first commit list with pagination, optionally scoped to a path.
 */
export function CommitsTable({ repoId, path }: { repoId: string; path?: string }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['commits', repoId, path ?? '', offset],
    queryFn: () => api.getCommits(repoId, { path, limit: PAGE_SIZE, offset }),
    placeholderData: (previous) => previous,
    retry: 1,
  });

  if (query.isLoading) {
    return <div className="h-96 animate-pulse rounded-lg bg-slate-200" aria-hidden="true" />;
  }
  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={(query.error as Error).message}
        onRetry={() => query.refetch()}
      />
    );
  }

  const { total, commits } = query.data;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + commits.length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Commits</h2>
          <p className="text-sm text-slate-500">
            {path ? (
              <>
                Touching <code className="rounded bg-slate-100 px-1">{path}</code> —{' '}
              </>
            ) : null}
            {fmtNumber(total)} non-merge commit{total === 1 ? '' : 's'}, newest first.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">
            {fmtNumber(rangeStart)}–{fmtNumber(rangeEnd)} of {fmtNumber(total)}
          </span>
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={rangeEnd >= total}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
            className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Commit</th>
              <th className="px-4 py-3 font-medium">Author</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 text-right font-medium">Added</th>
              <th className="px-6 py-3 text-right font-medium">Removed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {commits.map((commit) => (
              <tr key={commit.hash} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-mono text-xs text-slate-500">
                  {commit.hash.slice(0, 7)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{commit.authorName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {fmtDate(commit.committerDate)}
                </td>
                <td className="max-w-sm truncate px-4 py-3 text-slate-700" title={commit.subject}>
                  {commit.subject}
                </td>
                <td className="px-4 py-3 text-right text-emerald-600">{fmtNumber(commit.added)}</td>
                <td className="px-6 py-3 text-right text-rose-600">{fmtNumber(commit.removed)}</td>
              </tr>
            ))}
            {commits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-6 text-center text-slate-500">
                  {path ? 'No commits ever touched this path.' : 'This repository has no commits.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
