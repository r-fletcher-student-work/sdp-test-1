import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { CommitsTable } from '../components/CommitsTable';
import { ErrorBanner } from '../components/ErrorBanner';
import { FileTreeBrowser } from '../components/FileTreeBrowser';
import { MetricsChart } from '../components/MetricsChart';
import { PathMetricsView } from '../components/PathMetricsView';
import { StatCards } from '../components/StatCards';

export function RepoPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPath = searchParams.get('path') ?? '';
  const activeTab = searchParams.get('tab') === 'commits' ? 'commits' : 'metrics';

  const showTab = (tab: 'metrics' | 'commits') => {
    setSearchParams(tab === 'commits' ? { tab: 'commits' } : selectedPath ? { path: selectedPath } : {});
  };

  const summaryQuery = useQuery({
    queryKey: ['summary', id],
    queryFn: () => api.getSummary(id),
    retry: 1,
  });
  const treeQuery = useQuery({
    queryKey: ['tree', id],
    queryFn: () => api.getTree(id),
    retry: 1,
  });

  const selectPath = (path: string) => {
    setSearchParams(path === '' ? {} : { path });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            All repositories
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {summaryQuery.data?.repo.name ?? 'Repository'}
          </h1>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm">
          {(['metrics', 'commits'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => showTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 font-medium capitalize ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
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

      {activeTab === 'commits' ? (
        <CommitsTable repoId={id} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6">
            {treeQuery.isLoading && (
              <div className="h-64 animate-pulse rounded-lg bg-slate-200" aria-hidden="true" />
            )}
            {treeQuery.isError && (
              <ErrorBanner
                message={(treeQuery.error as Error).message}
                onRetry={() => treeQuery.refetch()}
              />
            )}
            {treeQuery.data && (
              <FileTreeBrowser
                node={treeQuery.data.tree}
                selectedPath={selectedPath}
                onSelect={selectPath}
              />
            )}
          </aside>

          <section className="min-w-0 space-y-6">
            {selectedPath === '' ? (
              summaryQuery.data && (
                <>
                  <StatCards summary={summaryQuery.data.summary} />
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-semibold">Growth &amp; churn over time</h2>
                    <p className="text-sm text-slate-500">
                      Cumulative across all commits, oldest to newest. Very large histories are
                      sampled per point to keep the chart responsive — every value stays exact.
                    </p>
                    <div className="mt-4">
                      <MetricsChart data={summaryQuery.data.summary.timeseries} />
                    </div>
                  </div>
                </>
              )
            ) : (
              summaryQuery.data && (
                <PathMetricsView
                  repoId={id}
                  path={selectedPath}
                  repoName={summaryQuery.data.repo.name}
                  onSelectPath={selectPath}
                />
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
}
