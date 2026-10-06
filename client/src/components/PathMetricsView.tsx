import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, type CommitsResponse } from '../api/client';
import type { ChildMetric, CommitSetFilter, PathMetrics } from '../api/types';
import { ErrorBanner } from './ErrorBanner';
import { MetricsChart } from './MetricsChart';
import { FileIcon, FolderIcon } from './icons';
import { fmtDate, fmtNumber, fmtRate } from '../lib/format';

interface PathMetricsViewProps {
  repoId: string;
  path: string;
  repoName: string;
  /** active commit-set filter (H) shared across the dashboard */
  filter: CommitSetFilter;
  onSelectPath(path: string): void;
}

/**
 * Metrics for one file or directory: stat cards, cumulative chart, and — for
 * directories — the immediate-children table; for files — the per-commit
 * deltas list.
 */
export function PathMetricsView({ repoId, path, repoName, filter, onSelectPath }: PathMetricsViewProps) {
  const filterKey = JSON.stringify(filter);
  const metricsQuery = useQuery({
    queryKey: ['metrics', repoId, path, filterKey],
    queryFn: () => api.getMetrics(repoId, path, filter),
    retry: 1,
  });
  const isFile = metricsQuery.data?.metrics.type === 'file';
  const commitsQuery = useQuery({
    queryKey: ['path-commits', repoId, path, filterKey],
    queryFn: () => api.getCommits(repoId, { path, limit: 100, filter }),
    enabled: isFile === true,
    retry: 1,
  });

  if (metricsQuery.isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-14 rounded-lg bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-200" />
          ))}
        </div>
        <div className="h-80 rounded-lg bg-slate-200" />
      </div>
    );
  }

  if (metricsQuery.isError || !metricsQuery.data) {
    return (
      <div className="space-y-4">
        <ErrorBanner
          message={(metricsQuery.error as Error | undefined)?.message ?? 'Failed to load metrics.'}
          onRetry={() => metricsQuery.refetch()}
        />
        <button
          type="button"
          onClick={() => onSelectPath('')}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to repository overview
        </button>
      </div>
    );
  }

  const { metrics } = metricsQuery.data;

  return (
    <div className="space-y-6">
      <Breadcrumb path={path} repoName={repoName} onSelectPath={onSelectPath} />

      <PathStats metrics={metrics} />

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Growth &amp; churn over time</h2>
        <p className="text-sm text-slate-500">
          Cumulative across the commits that touched{' '}
          <code className="rounded bg-slate-100 px-1">{metrics.path || '/'}</code>, oldest to
          newest. Large histories are sampled per point — every value stays exact.
        </p>
        <div className="mt-4">
          <MetricsChart data={metrics.timeseries} />
        </div>
      </section>

      {metrics.type === 'dir' ? (
        <>
          <DirectoryInsights items={metrics.children} onSelectPath={onSelectPath} />
          <ChildrenTable items={metrics.children} onSelectPath={onSelectPath} />
        </>
      ) : (
        <FileCommitDeltas query={commitsQuery} />
      )}
    </div>
  );
}

function Breadcrumb({
  path,
  repoName,
  onSelectPath,
}: {
  path: string;
  repoName: string;
  onSelectPath(path: string): void;
}) {
  const segments = path.split('/');
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onSelectPath('')}
        className="font-medium text-blue-600 hover:underline"
      >
        {repoName}
      </button>
      {segments.map((segment, index) => {
        const prefix = segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        return (
          <span key={prefix} className="flex items-center gap-1">
            <span className="text-slate-400">/</span>
            {isLast ? (
              <span className="font-semibold text-slate-900">{segment}</span>
            ) : (
              <button
                type="button"
                onClick={() => onSelectPath(prefix)}
                className="text-blue-600 hover:underline"
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function PathStats({ metrics }: { metrics: PathMetrics }) {
  const items: Array<{ label: string; value: number | string; tone?: string }> = [
    { label: 'Added lines', value: metrics.totals.added, tone: 'text-emerald-600' },
    { label: 'Removed lines', value: metrics.totals.removed, tone: 'text-rose-600' },
    {
      label: 'Growth',
      value: metrics.totals.growth,
      tone: metrics.totals.growth >= 0 ? 'text-emerald-600' : 'text-rose-600',
    },
    { label: 'Churn', value: metrics.totals.churn, tone: 'text-blue-600' },
    { label: 'Modifications', value: metrics.modifications },
    { label: 'Commit set |H|', value: metrics.commitSetSize, tone: 'text-indigo-600' },
    { label: 'Modif. freq. η', value: fmtRate(metrics.frequency), tone: 'text-indigo-600' },
    { label: 'Churn rate ρ', value: fmtRate(metrics.churnRate), tone: 'text-indigo-600' },
  ];
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
        {metrics.type === 'dir' ? (
          <FolderIcon className="h-4 w-4 text-blue-400" />
        ) : (
          <FileIcon className="h-4 w-4 text-slate-400" />
        )}
        <span className="uppercase tracking-wide">{metrics.type}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
            <div className={`mt-1 text-2xl font-semibold ${item.tone ?? 'text-slate-900'}`}>
              {typeof item.value === 'number' ? fmtNumber(item.value) : item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectoryInsights({
  items,
  onSelectPath,
}: {
  items: ChildMetric[];
  onSelectPath(path: string): void;
}) {
  const ranked = [...items].sort((a, b) => b.churn - a.churn).slice(0, 10);
  const topModified = [...items].sort((a, b) => b.modifications - a.modifications).slice(0, 5);
  const maxChurn = Math.max(...ranked.map((item) => item.churn), 1);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Directory heatmap</h2>
        <p className="text-sm text-slate-500">Largest children by churn.</p>
        {ranked.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No child paths match this view.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ranked.map((item) => {
              const intensity = Math.max(12, Math.round((item.churn / maxChurn) * 100));
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onSelectPath(item.path)}
                  className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-left hover:border-blue-300"
                  style={{ opacity: intensity / 100 }}
                >
                  <div className="truncate text-sm font-semibold text-slate-900" title={item.name}>{item.name}</div>
                  <div className="mt-1 text-xs text-slate-600">{fmtNumber(item.churn)} churn</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Top modified</h2>
        <p className="text-sm text-slate-500">Most frequently touched children.</p>
        <div className="mt-4 space-y-3">
          {topModified.length === 0 ? (
            <p className="text-sm text-slate-500">No child paths match this view.</p>
          ) : (
            topModified.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onSelectPath(item.path)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="truncate text-sm font-medium text-slate-800" title={item.name}>{item.name}</span>
                <span className="text-sm text-slate-500">{fmtNumber(item.modifications)}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ChildrenTable({
  items,
  onSelectPath,
}: {
  items: ChildMetric[];
  onSelectPath(path: string): void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-semibold">Immediate children</h2>
        <p className="text-sm text-slate-500">Direct children with recursive totals.</p>
      </div>
      {items.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-500">Nothing ever changed inside this path.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Removed</th>
                <th className="px-4 py-3 font-medium">Growth</th>
                <th className="px-4 py-3 font-medium">Churn</th>
                <th className="px-6 py-3 font-medium">Modifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((child) => (
                <tr
                  key={child.path}
                  onClick={() => onSelectPath(child.path)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-6 py-3">
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      {child.type === 'dir' ? (
                        <FolderIcon className="h-4 w-4 shrink-0 text-blue-400" />
                      ) : (
                        <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      {child.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-emerald-600">{fmtNumber(child.added)}</td>
                  <td className="px-4 py-3 text-rose-600">{fmtNumber(child.removed)}</td>
                  <td className={`px-4 py-3 ${child.growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {fmtNumber(child.growth)}
                  </td>
                  <td className="px-4 py-3 text-blue-600">{fmtNumber(child.churn)}</td>
                  <td className="px-6 py-3 text-slate-600">{fmtNumber(child.modifications)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FileCommitDeltas({
  query,
}: {
  query: UseQueryResult<CommitsResponse, Error>;
}) {
  if (query.isLoading) {
    return <div className="h-48 animate-pulse rounded-lg bg-slate-200" />;
  }
  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={(query.error as Error | undefined)?.message ?? 'Failed to load commit deltas.'}
        onRetry={() => query.refetch()}
      />
    );
  }
  const { total, commits } = query.data;
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-semibold">Changes per commit</h2>
        <p className="text-sm text-slate-500">
          {fmtNumber(total)} commit{total === 1 ? '' : 's'} touched this file
          {total > commits.length ? ` — showing the ${fmtNumber(commits.length)} newest` : ''}.
        </p>
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
            {commits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-6 text-center text-slate-500">
                  No commit deltas match this view.
                </td>
              </tr>
            )}
            {commits.map((commit) => (
              <tr key={commit.hash} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-mono text-xs text-slate-500">
                  {commit.hash.slice(0, 7)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{commit.authorName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {fmtDate(commit.committerDate)}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-700" title={commit.subject}>
                  {commit.subject}
                </td>
                <td className="px-4 py-3 text-right text-emerald-600">{fmtNumber(commit.added)}</td>
                <td className="px-6 py-3 text-right text-rose-600">{fmtNumber(commit.removed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
