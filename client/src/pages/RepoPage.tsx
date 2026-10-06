import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { CommitSetFilter } from '../api/types';
import { AuthorPanel } from '../components/AuthorPanel';
import { CommitsTable } from '../components/CommitsTable';
import { ErrorBanner } from '../components/ErrorBanner';
import { FileTreeBrowser } from '../components/FileTreeBrowser';
import { FilterBar } from '../components/FilterBar';
import { MetricsChart } from '../components/MetricsChart';
import { PathMetricsView } from '../components/PathMetricsView';
import { StatCards } from '../components/StatCards';

/** Commit-set filter decoded from the URL (from/to/author/commits params). */
function parseFilter(params: URLSearchParams): CommitSetFilter {
  const filter: CommitSetFilter = {};
  const from = Number.parseInt(params.get('from') ?? '', 10);
  if (Number.isFinite(from) && from >= 0) filter.from = from;
  const to = Number.parseInt(params.get('to') ?? '', 10);
  if (Number.isFinite(to) && to >= 0) filter.to = to;
  const author = params.get('author')?.trim();
  if (author) filter.author = author;
  const hashes = (params.get('commits') ?? '')
    .split(',')
    .map((hash) => hash.trim())
    .filter(Boolean);
  if (hashes.length > 0) filter.hashes = hashes;
  return filter;
}

export function RepoPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPath = searchParams.get('path') ?? '';
  const activeTab = searchParams.get('tab') === 'commits' ? 'commits' : 'metrics';
  const activeView = searchParams.get('view') === 'authors' ? 'authors' : 'files';
  const filter = parseFilter(searchParams);
  const filterKey = JSON.stringify(filter);

  // Navigation helpers keep the params they must not touch (path, tab, filter).
  const updateParams = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams);
    update(params);
    setSearchParams(params);
  };

  const showTab = (tab: 'metrics' | 'commits') =>
    updateParams((params) => {
      if (tab === 'commits') params.set('tab', 'commits');
      else params.delete('tab');
    });

  const selectPath = (path: string) =>
    updateParams((params) => {
      if (path === '') params.delete('path');
      else params.set('path', path);
    });

  const showView = (view: 'files' | 'authors') =>
    updateParams((params) => {
      if (view === 'authors') params.set('view', 'authors');
      else params.delete('view');
    });

  const setFilter = (next: CommitSetFilter) =>
    updateParams((params) => {
      const apply = (key: string, value?: string) => {
        if (value) params.set(key, value);
        else params.delete(key);
      };
      apply('from', next.from !== undefined ? String(next.from) : undefined);
      apply('to', next.to !== undefined ? String(next.to) : undefined);
      apply('author', next.author);
      apply('commits', next.hashes?.length ? next.hashes.join(',') : undefined);
    });

  const toggleCommit = (hash: string) => {
    const hashes = new Set(filter.hashes ?? []);
    if (hashes.has(hash)) hashes.delete(hash);
    else hashes.add(hash);
    setFilter({ ...filter, hashes: [...hashes] });
  };

  const summaryQuery = useQuery({
    queryKey: ['summary', id, filterKey],
    queryFn: () => api.getSummary(id, filter),
    retry: 1,
  });
  const treeQuery = useQuery({
    queryKey: ['tree', id],
    queryFn: () => api.getTree(id),
    retry: 1,
  });
  const authorsQuery = useQuery({
    queryKey: ['authors', id],
    queryFn: () => api.getAuthors(id),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const filterActive = filterKey !== '{}';

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

      <FilterBar
        filter={filter}
        authors={authorsQuery.data?.authors}
        onChange={setFilter}
      />

      {summaryQuery.isLoading && (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
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
        <CommitsTable
          repoId={id}
          filter={filter}
          selection={filter.hashes ?? []}
          onToggleCommit={toggleCommit}
        />
      ) : (
        <>
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm sm:w-fit">
            {(['files', 'authors'] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => showView(view)}
                aria-current={activeView === view ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 font-medium capitalize ${
                  activeView === view
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {view}
              </button>
            ))}
          </div>

          {activeView === 'authors' ? (
            <AuthorPanel repoId={id} path={selectedPath} filter={filter} />
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
                          Cumulative across {filterActive ? 'the active commit set' : 'all commits'}.
                          Large histories are sampled per point; values stay exact.
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
                      filter={filter}
                      onSelectPath={selectPath}
                    />
                  )
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
