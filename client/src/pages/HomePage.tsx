import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { UploadCard } from '../components/UploadCard';

export function HomePage() {
  const queryClient = useQueryClient();
  const reposQuery = useQuery({ queryKey: ['repos'], queryFn: api.listRepos });
  const deleteRepo = useMutation({
    mutationFn: api.deleteRepo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });

  return (
    <div className="space-y-8">
      <UploadCard />
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
              No repositories yet — upload a zip above to get started.
            </p>
          )}
          {reposQuery.data?.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <Link to={`/repo/${repo.id}`} className="font-semibold text-blue-600 hover:underline">
                  {repo.name}
                </Link>
                <div className="text-xs text-slate-500">
                  Added {new Date(repo.addedAt).toLocaleString()}
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
