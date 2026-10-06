import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CommitPoint } from '../api/types';
import { fmtDate, fmtNumber } from '../lib/format';

export function MetricsChart({ data }: { data: CommitPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
        No trend data for this view.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) => fmtDate(value)}
            stroke="#64748b"
            fontSize={12}
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            width={72}
            tickFormatter={(value: number) => fmtNumber(value)}
          />
          <Tooltip
            labelFormatter={(label) => fmtDate(Number(label))}
            formatter={(value) => fmtNumber(Number(value))}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="cumGrowth"
            name="Cumulative growth"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="cumChurn"
            name="Cumulative churn"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="churn"
            name="Commit churn"
            stroke="#93c5fd"
            strokeWidth={1}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
