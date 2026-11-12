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
import { ChangeEvent, useState } from 'react';
import Link from 'next/link';
import type { FinanceData } from '@/lib/types';
import StatCard from './StatCard';
import ProgressBar from './ProgressBar';

interface FinancePanelProps {
  data: FinanceData | null;
  loading: boolean;
  onRefresh?: () => Promise<void>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        padding: '8px 12px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.06)',
        fontSize: '12px',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div>Spent: <strong style={{ color: 'var(--lime)' }}>₹{payload[0]?.value?.toLocaleString('en-IN')}</strong></div>
      {payload[1] && (
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
          Budget: ₹{payload[1]?.value?.toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
};

export default function FinancePanel({ data, loading, onRefresh }: FinancePanelProps) {
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');

  async function uploadStatement(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportFeedback('Reading and classifying statement...');
    try {
      const form = new FormData();
      form.set('statement', file);
      const response = await fetch('/api/finance/statement', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Statement import failed.');
      setImportFeedback(body.duplicate
        ? 'This exact statement was already imported.'
        : `Imported ${body.imported} of ${body.extracted} extracted transactions.`);
      await onRefresh?.();
    } catch (error) {
      setImportFeedback(error instanceof Error ? error.message : 'Statement import failed.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  if (loading || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '280px', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
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
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
            {data.month}
          </span>
          <Link
            href="/finance"
            style={{
              color: 'var(--lime)',
              textDecoration: 'none',
              fontFamily: 'var(--font-display)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Manage →
          </Link>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <StatCard
          label="Total Spent"
          value={`₹${(data.totalSpent / 1000).toFixed(1)}k`}
          unit={`/ ₹${(data.totalBudget / 1000).toFixed(0)}k`}
          accent={spentColor as any}
        />
        <StatCard
          label="Savings Rate"
          value={`${Math.round(data.savingsRate * 100)}%`}
          unit="of income"
          accent={data.savingsRate >= 0.2 ? 'lime' : 'amber'}
        />
      </div>

      {/* Overall spend bar */}
      <ProgressBar
        label="Monthly Budget Used"
        value={data.totalSpent}
        max={data.totalBudget}
        unit="₹"
        color={spentColor as any}
      />

      {/* Statement intake */}
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          padding: '12px 14px',
          background: 'var(--bg-base)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Statement Intake
          </span>
          <label className="btn" style={{ fontSize: '11px', padding: '0.25rem 0.65rem' }}>
            {importing ? 'Importing...' : 'Upload PDF'}
            <input type="file" accept="application/pdf,.pdf" disabled={importing} onChange={uploadStatement} style={{ display: 'none' }} />
          </label>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Upload bank/UPI statement PDF or email to <strong style={{ color: 'var(--text-primary)' }}>soumyasubhrajit+vira@gmail.com</strong>.
        </span>
        {importFeedback && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--amber)' }}>
            {importFeedback}
          </span>
        )}
      </div>

      <div className="divider" />

      {/* Category breakdown chart */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Spending by Category
          </span>
          {overBudgetCats.length > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--danger)' }}>
              Over: {overBudgetCats.map((c) => c.name).join(', ')}
            </span>
          )}
        </div>

        <div style={{ height: '120px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.categories}
              barSize={12}
              barGap={4}
              margin={{ top: 4, right: 0, left: -24, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="spent" radius={[3, 3, 0, 0]}>
                {data.categories.map((cat) => (
                  <Cell
                    key={cat.name}
                    fill={cat.spent > cat.budget ? 'var(--danger)' : 'var(--lime)'}
                  />
                ))}
              </Bar>
              <Bar dataKey="budget" radius={[3, 3, 0, 0]} fill="#E2E8F0" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
