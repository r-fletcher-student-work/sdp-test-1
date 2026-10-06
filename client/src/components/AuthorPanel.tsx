import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CommitSetFilter } from '../api/types';
import { fmtNumber, fmtRate } from '../lib/format';
import { ErrorBanner } from './ErrorBanner';

interface AuthorPanelProps {
  repoId: string;
  path: string;
  filter: CommitSetFilter;
}

export function AuthorPanel({ repoId, path, filter }: AuthorPanelProps) {
  const queryClient = useQueryClient();
  const filterKey = JSON.stringify(filter);
  const [selected, setSelected] = useState<string[]>([]);
  const [canonical, setCanonical] = useState('');

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
    },
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
    },
  });

  const identities = query.data?.identities ?? [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const canMerge = selected.length >= 2 && canonical !== '' && selectedSet.has(canonical);

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
        <h2 className="text-lg font-semibold">Authors</h2>
        <p className="text-sm text-slate-500">Churn, modifications, and ownership for this view.</p>
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
                  <th className="px-6 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 text-right font-medium">Commits</th>
                  <th className="px-4 py-3 text-right font-medium">Mods</th>
                  <th className="px-4 py-3 text-right font-medium">Churn</th>
                  <th className="px-6 py-3 font-medium">Ownership</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.authors.map((author) => (
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
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Merge identities</span>
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
