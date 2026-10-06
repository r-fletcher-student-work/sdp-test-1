import type { AuthorInfo, CommitSetFilter } from '../api/types';
import { fmtNumber } from '../lib/format';

const DAY_SECONDS = 86_400;

/** yyyy-mm-dd shown in a date input for a unix-seconds timestamp. */
function dateInputValue(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Unix seconds for the UTC start of a date-input value. */
function dayStartSeconds(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 1000);
}

interface FilterBarProps {
  filter: CommitSetFilter;
  /** authors for the dropdown (undefined while loading) */
  authors: AuthorInfo[] | undefined;
  onChange(next: CommitSetFilter): void;
}

/**
 * Dashboard-wide commit-set filter (SPEC section 4): a date range or a manual
 * commit selection (built in the commits table), intersected with an author.
 * Written straight into the URL so views stay shareable and consistent.
 */
export function FilterBar({ filter, authors, onChange }: FilterBarProps) {
  const selectionActive = (filter.hashes?.length ?? 0) > 0;
  const active = selectionActive || filter.from !== undefined || filter.to !== undefined || Boolean(filter.author);

  const setFrom = (value: string) =>
    onChange({ ...filter, from: value ? dayStartSeconds(value) : undefined });
  const setTo = (value: string) =>
    onChange({ ...filter, to: value ? dayStartSeconds(value) + DAY_SECONDS : undefined });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="filter-from"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={filter.from !== undefined ? dateInputValue(filter.from) : ''}
            onChange={(event) => setFrom(event.target.value)}
            disabled={selectionActive}
            title={selectionActive ? 'Manual selection overrides the date range' : undefined}
            className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 disabled:opacity-40"
          />
        </div>
        <div>
          <label
            htmlFor="filter-to"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={filter.to !== undefined ? dateInputValue(Math.max(0, filter.to - DAY_SECONDS)) : ''}
            onChange={(event) => setTo(event.target.value)}
            disabled={selectionActive}
            title={selectionActive ? 'Manual selection overrides the date range' : undefined}
            className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 disabled:opacity-40"
          />
        </div>
        <div>
          <label
            htmlFor="filter-author"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Author
          </label>
          <select
            id="filter-author"
            value={filter.author ?? ''}
            onChange={(event) => onChange({ ...filter, author: event.target.value || undefined })}
            className="mt-1 max-w-56 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">All authors</option>
            {(authors ?? []).map((author) => (
              <option key={author.key} value={author.key}>
                {author.name} ({fmtNumber(author.commitCount)})
              </option>
            ))}
          </select>
        </div>
        {selectionActive && (
          <span className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
            {fmtNumber(filter.hashes!.length)} commit
            {filter.hashes!.length === 1 ? '' : 's'} selected
            <button
              type="button"
              onClick={() => onChange({ ...filter, hashes: undefined })}
              aria-label="Clear commit selection"
              className="rounded px-1 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
            >
              ×
            </button>
          </span>
        )}
        {active && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="ml-auto rounded-md px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            Reset filters
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Every metric, chart, and the commit list use the commit set H = (date range or selection)
        ∩ author. The selected path scopes what is measured — it does not shrink H. 'To' includes
        that whole day; the selection overrides the dates.
      </p>
    </section>
  );
}
