import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { MetricsChart } from '../components/MetricsChart';
import { StatCards } from '../components/StatCards';

export function RepoPage() {
  const { id = '' } = useParams();
  const summaryQuery = useQuery({
    queryKey: ['summary', id],
    queryFn: () => api.getSummary(id),
    retry: 1,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          All repositories
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{summaryQuery.data?.repo.name ?? 'Repository'}</h1>
      </div>

      {summaryQuery.isLoading && (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-200" />
            ))}
          </div>
          <div className="h-80 rounded-lg bg-slate-200" />
        </div>
      )}

      {summaryQuery.isError && (
        <ErrorBanner
          message={(summaryQuery.error as Error).message}
          onRetry={() => summaryQuery.refetch()}
        />
      )}

      {summaryQuery.data && (
        <>
          <StatCards summary={summaryQuery.data.summary} />
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Growth &amp; churn over time</h2>
            <p className="text-sm text-slate-500">Cumulative across all commits, oldest to newest.</p>
            <div className="mt-4">
              <MetricsChart data={summaryQuery.data.summary.timeseries} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
