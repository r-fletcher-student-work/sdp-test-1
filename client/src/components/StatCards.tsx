import type { RepoSummary } from '../api/types';
import { fmtNumber } from '../lib/format';

export function StatCards({ summary }: { summary: RepoSummary }) {
  const items: Array<{ label: string; value: number; tone?: string }> = [
    { label: 'Commits', value: summary.commitCount },
    { label: 'Authors', value: summary.authorCount },
    { label: 'Files touched', value: summary.fileCount },
    { label: 'Added lines', value: summary.totals.added, tone: 'text-emerald-600' },
    { label: 'Removed lines', value: summary.totals.removed, tone: 'text-rose-600' },
    {
      label: 'Growth',
      value: summary.totals.growth,
      tone: summary.totals.growth >= 0 ? 'text-emerald-600' : 'text-rose-600',
    },
    { label: 'Churn', value: summary.totals.churn, tone: 'text-blue-600' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</div>
          <div className={`mt-1 text-2xl font-semibold ${item.tone ?? 'text-slate-900'}`}>
            {fmtNumber(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
