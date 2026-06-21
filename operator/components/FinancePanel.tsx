'use client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FinanceData } from '@/lib/types';
import StatCard from './StatCard';
import ProgressBar from './ProgressBar';

interface FinancePanelProps {
  data: FinanceData | null;
  loading: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: '4px',
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div>Spent: <span style={{ color: 'var(--lime)' }}>₹{payload[0]?.value?.toLocaleString('en-IN')}</span></div>
      {payload[1] && (
        <div>Budget: <span style={{ color: 'var(--text-muted)' }}>₹{payload[1]?.value?.toLocaleString('en-IN')}</span></div>
      )}
    </div>
  );
};

export default function FinancePanel({ data, loading }: FinancePanelProps) {
  if (loading || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '260px' }}>
        <span className="label">Finance</span>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
          Loading finance data...
        </div>
      </div>
    );
  }

  const overBudgetCats = data.categories.filter((c) => c.spent > c.budget);
  const spentPct = Math.round((data.totalSpent / data.totalBudget) * 100);
  const spentColor = spentPct > 90 ? 'danger' : spentPct > 75 ? 'amber' : 'lime';

  return (
    <div className="panel fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="label">Finance</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {data.isMock && <span className="mock-badge">mock data</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            {data.month}
          </span>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'flex', gap: '2rem' }}>
        <StatCard
          label="Spent"
          value={`₹${(data.totalSpent / 1000).toFixed(1)}k`}
          unit={`/ ₹${(data.totalBudget / 1000).toFixed(0)}k`}
          accent={spentColor as any}
        />
        <StatCard
          label="Savings Rate"
          value={`${Math.round(data.savingsRate * 100)}%`}
          accent={data.savingsRate >= 0.2 ? 'lime' : 'amber'}
        />
      </div>

      {/* Overall spend bar */}
      <ProgressBar
        label="Monthly Budget"
        value={data.totalSpent}
        max={data.totalBudget}
        unit="₹"
        color={spentColor as any}
      />

      <div className="divider" />

      {/* Category breakdown chart */}
      <div>
        <span className="label" style={{ marginBottom: '10px', display: 'flex' }}>
          Categories
        </span>
        <div style={{ height: '110px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.categories}
              barSize={10}
              barGap={3}
              margin={{ top: 0, right: 0, left: -28, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--text-dim)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="spent" radius={[2, 2, 0, 0]}>
                {data.categories.map((cat, i) => (
                  <Cell
                    key={cat.name}
                    fill={cat.spent > cat.budget ? 'var(--danger)' : 'var(--lime)'}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
              <Bar dataKey="budget" radius={[2, 2, 0, 0]} fill="var(--border-default)" fillOpacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {overBudgetCats.length > 0 && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--danger)', marginTop: '6px' }}>
            ↑ Over budget: {overBudgetCats.map((c) => c.name).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
