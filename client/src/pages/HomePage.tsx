import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type SummaryResponse } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { UploadCard } from '../components/UploadCard';
import { fmtNumber } from '../lib/format';

export function HomePage() {
  const queryClient = useQueryClient();
  const reposQuery = useQuery({ queryKey: ['repos'], queryFn: api.listRepos });
  const repos = reposQuery.data ?? [];
  const summaryQueries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: ['summary', repo.id, 'comparison'],
      queryFn: () => api.getSummary(repo.id),
      enabled: repos.length > 1,
      staleTime: 60_000,
    })),
  });
  const deleteRepo = useMutation({
    mutationFn: api.deleteRepo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });

  return (
    <div className="space-y-8">
      <UploadCard />
      {repos.length > 1 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Compare repositories</h2>
          <p className="mt-1 text-sm text-slate-600">Headline metrics across ingested repos.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Repository</th>
                  <th className="px-3 py-2 text-right font-medium">Commits</th>
                  <th className="px-3 py-2 text-right font-medium">Authors</th>
                  <th className="px-3 py-2 text-right font-medium">Files</th>
                  <th className="px-3 py-2 text-right font-medium">Growth</th>
                  <th className="px-3 py-2 text-right font-medium">Churn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repos.map((repo, index) => {
                  const summary = (summaryQueries[index].data as SummaryResponse | undefined)?.summary;
                  return (
                    <tr key={repo.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <Link to={`/repo/${repo.id}`} className="text-blue-600 hover:underline">
                          {repo.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">{summary ? fmtNumber(summary.commitCount) : '...'}</td>
                      <td className="px-3 py-2 text-right">{summary ? fmtNumber(summary.authorCount) : '...'}</td>
                      <td className="px-3 py-2 text-right">{summary ? fmtNumber(summary.fileCount) : '...'}</td>
                      <td className="px-3 py-2 text-right">{summary ? fmtNumber(summary.totals.growth) : '...'}</td>
                      <td className="px-3 py-2 text-right">{summary ? fmtNumber(summary.totals.churn) : '...'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section>
        <h2 className="text-xl font-semibold">Repositories</h2>
        <div className="mt-4 space-y-3">
          {reposQuery.isLoading && (
            <p className="text-sm text-slate-500">Loading repositories...</p>
          )}
          {reposQuery.isError && (
            <ErrorBanner
              message={(reposQuery.error as Error).message}
              onRetry={() => reposQuery.refetch()}
            />
          )}
          {reposQuery.data && reposQuery.data.length === 0 && (
            <p className="text-sm text-slate-500">
              No repositories yet — add one above to get started.
            </p>
          )}
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <Link to={`/repo/${repo.id}`} className="font-semibold text-blue-600 hover:underline">
                  {repo.name}
                </Link>
                <div className="text-xs text-slate-500">
                  Added {new Date(repo.addedAt).toLocaleString()} · {repo.source === 'url' ? 'URL clone' : 'Zip upload'}
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/repo/${repo.id}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove repository "${repo.name}"?`)) deleteRepo.mutate(repo.id);
                  }}
                  disabled={deleteRepo.isPending}
                  className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
