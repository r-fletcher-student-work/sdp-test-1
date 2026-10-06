import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CommitSetFilter } from '../api/types';
import { fmtNumber, fmtRate } from '../lib/format';
import { ErrorBanner } from './ErrorBanner';
import { useToast } from './Toast';

const PAGE_SIZE = 25;

type SortKey = 'author' | 'commits' | 'modifications' | 'churn' | 'ownership';
type SortDirection = 'asc' | 'desc';

interface AuthorPanelProps {
  repoId: string;
  path: string;
  filter: CommitSetFilter;
}

export function AuthorPanel({ repoId, path, filter }: AuthorPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const filterKey = JSON.stringify(filter);
  const [selected, setSelected] = useState<string[]>([]);
  const [canonical, setCanonical] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('churn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const query = useQuery({
    queryKey: ['author-metrics', repoId, path, filterKey],
    queryFn: () => api.getAuthors(repoId, { path, filter }),
    retry: 1,
  });

  const mergeMutation = useMutation({
    mutationFn: () => api.mergeAuthors(repoId, canonical, selected.filter((key) => key !== canonical)),
    onSuccess: () => {
      setSelected([]);
      setCanonical('');
      void queryClient.invalidateQueries({ queryKey: ['authors', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['author-metrics', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['summary', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['metrics', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['commits', repoId] });
      showToast('Authors merged.', 'success');
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearAuthorMerges(repoId),
    onSuccess: () => {
      setSelected([]);
      setCanonical('');
      void queryClient.invalidateQueries({ queryKey: ['authors', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['author-metrics', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['summary', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['metrics', repoId] });
      void queryClient.invalidateQueries({ queryKey: ['commits', repoId] });
      showToast('Author merges cleared.', 'success');
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  useEffect(() => setPage(0), [filterKey, path]);

  const identities = query.data?.identities ?? [];
  const authors = query.data?.authors ?? [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const sortedAuthors = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...authors].sort((a, b) => {
      if (sortKey === 'author') return direction * a.name.localeCompare(b.name);
      if (sortKey === 'commits') return direction * (a.selectedCommitCount - b.selectedCommitCount);
      if (sortKey === 'modifications') return direction * (a.modifications - b.modifications);
      if (sortKey === 'ownership') return direction * (a.ownership - b.ownership);
      return direction * (a.churn - b.churn);
    });
  }, [authors, sortDirection, sortKey]);
  const canMerge = selected.length >= 2 && canonical !== '' && selectedSet.has(canonical);
  const totalPages = Math.max(1, Math.ceil(sortedAuthors.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageAuthors = sortedAuthors.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = sortedAuthors.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = pageStart + pageAuthors.length;

  const changeSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'author' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  const sortLabel = (key: SortKey) => (sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '');

  const toggle = (key: string) => {
    setSelected((current) => {
      if (current.includes(key)) {
        const next = current.filter((item) => item !== key);
        if (canonical === key) setCanonical(next[0] ?? '');
        return next;
      }
      const next = [...current, key];
      if (!canonical) setCanonical(key);
      return next;
    });
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Authors</h2>
            <p className="text-sm text-slate-500">Churn, modifications, and ownership for this view.</p>
          </div>
          {sortedAuthors.length > PAGE_SIZE && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">
                {fmtNumber(rangeStart)}–{fmtNumber(rangeEnd)} of {fmtNumber(sortedAuthors.length)}
              </span>
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
                className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {query.isLoading && <div className="h-40 animate-pulse rounded-b-lg bg-slate-100" />}
      {query.isError && (
        <div className="p-6">
          <ErrorBanner message={(query.error as Error).message} onRetry={() => query.refetch()} />
        </div>
      )}

      {query.data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortableHeader
                    label="Name"
                    active={sortKey === 'author'}
                    onClick={() => changeSort('author')}
                    suffix={sortLabel('author')}
                  />
                  <SortableHeader
                    label="Commits"
                    align="right"
                    active={sortKey === 'commits'}
                    onClick={() => changeSort('commits')}
                    suffix={sortLabel('commits')}
                  />
                  <SortableHeader
                    label="Mods"
                    align="right"
                    active={sortKey === 'modifications'}
                    onClick={() => changeSort('modifications')}
                    suffix={sortLabel('modifications')}
                  />
                  <SortableHeader
                    label="Churn"
                    align="right"
                    active={sortKey === 'churn'}
                    onClick={() => changeSort('churn')}
                    suffix={sortLabel('churn')}
                  />
                  <SortableHeader
                    label="Ownership"
                    active={sortKey === 'ownership'}
                    onClick={() => changeSort('ownership')}
                    suffix={sortLabel('ownership')}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageAuthors.map((author) => (
                  <tr key={author.key} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-slate-900">{author.name}</div>
                      <div className="text-xs text-slate-500">{author.email}</div>
                      {author.aliases.length > 0 && (
                        <div className="mt-1 text-xs text-slate-400">
                          +{fmtNumber(author.aliases.length)} merged
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {fmtNumber(author.selectedCommitCount)} / {fmtNumber(author.commitCount)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmtNumber(author.modifications)}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{fmtNumber(author.churn)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.round(author.ownership * 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-slate-600">
                          {fmtRate(author.ownership * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 border-t border-slate-100 px-6 py-4">
            <div>
              <div className="text-sm font-medium text-slate-700">Merge identities</div>
              <p className="text-xs text-slate-500">Combine duplicate identities under one author.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={canonical}
                onChange={(event) => setCanonical(event.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
              >
                <option value="">Canonical author</option>
                {selected.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!canMerge || mergeMutation.isPending}
                onClick={() => mergeMutation.mutate()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-blue-700 disabled:opacity-40"
              >
                Merge
              </button>
              {query.data.merges.length > 0 && (
                <button
                  type="button"
                  disabled={clearMutation.isPending}
                  onClick={() => clearMutation.mutate()}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Clear merges
                </button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {identities.map((identity) => (
                <label key={identity.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(identity.key)}
                    onChange={() => toggle(identity.key)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <span className="truncate" title={identity.key}>{identity.key}</span>
                </label>
              ))}
            </div>

            {(mergeMutation.isError || clearMutation.isError) && (
              <ErrorBanner
                message={
                  ((mergeMutation.error ?? clearMutation.error) as Error | undefined)?.message ??
                  'Author merge failed.'
                }
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SortableHeader({
  label,
  active,
  suffix,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  suffix: string;
  onClick(): void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`uppercase tracking-wide hover:text-slate-900 ${active ? 'text-slate-900' : ''}`}
      >
        {label}{suffix}
      </button>
    </th>
  );
}
