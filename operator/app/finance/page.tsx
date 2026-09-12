'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './finance.module.css';
import FinanceControls, { type ReviewItem } from './FinanceControls';

type Direction = 'debit' | 'credit';
type Transaction = {
  sourceId: string;
  amount: number;
  direction: Direction;
  merchant: string;
  category: string;
  occurredAt: string;
  reference: string | null;
  source: string;
  purpose: string;
  categorySource: string;
  needsReview: boolean;
};
type MonthSummary = { month: string; transactionCount: number; spent: number; received: number };
type FinanceHistory = {
  month: string;
  summaries: MonthSummary[];
  totals: { spent: number; received: number; net: number; transactionCount: number };
  categories: Array<{ name: string; amount: number }>;
  transactions: Transaction[];
};

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function shortMonth(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'short' });
}

export default function FinanceDetailPage() {
  const [data, setData] = useState<FinanceHistory | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [direction, setDirection] = useState<'all' | Direction>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<ReviewItem|null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const suffix = selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : '';
    fetch(`/api/finance/history${suffix}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Failed to load finance history.');
        if (!cancelled) {
          setData(body as FinanceHistory);
          setSelectedMonth((current) => current || body.month);
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load finance history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey, selectedMonth]);

  const categories = useMemo(() => [...new Set(data?.transactions.map((item) => item.category) ?? [])].sort(), [data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.transactions ?? []).filter((item) => {
      if (reviewOnly && !item.needsReview) return false;
      if (direction !== 'all' && item.direction !== direction) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (needle && !`${item.merchant} ${item.reference ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [category, data, direction, query, reviewOnly]);

  const monthlyChart = useMemo(() => [...(data?.summaries ?? [])].reverse().map((item) => ({
    ...item,
    label: shortMonth(item.month),
  })), [data]);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link href="/">← Operator</Link>
          <div>
            <span>Finance intelligence</span>
            <h1>Transaction Command</h1>
          </div>
        </div>
        <div className={styles.topActions}>
          <span>{data ? `${data.totals.transactionCount} records loaded` : 'Loading ledger'}</span>
          <button onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>Refresh</button>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Selected operating period</span>
            <h2>{data ? monthLabel(data.month) : 'Finance history'}</h2>
            <p>Every imported Google Pay transaction, separated into money out, money in, category and counterparty.</p>
          </div>
          <label className={styles.monthControl}>
            <span>Month</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {(data?.summaries ?? []).map((item) => <option key={item.month} value={item.month}>{monthLabel(item.month)}</option>)}
            </select>
          </label>
        </section>

        {error && <div className={styles.error}>{error}</div>}
        <FinanceControls month={selectedMonth} editing={editing} onClose={()=>setEditing(null)} onSaved={()=>setRefreshKey(v=>v+1)} refreshKey={refreshKey}/>

        <section className={styles.stats} aria-busy={loading}>
          <article><span>Money sent</span><strong className={styles.debit}>{data ? money.format(data.totals.spent) : '—'}</strong><small>Outflow during selected month</small></article>
          <article><span>Money received</span><strong className={styles.credit}>{data ? money.format(data.totals.received) : '—'}</strong><small>Incoming transfers</small></article>
          <article><span>Net cash flow</span><strong className={(data?.totals.net ?? 0) >= 0 ? styles.credit : styles.debit}>{data ? money.format(data.totals.net) : '—'}</strong><small>Received minus sent</small></article>
          <article><span>Transactions</span><strong>{data?.totals.transactionCount ?? '—'}</strong><small>Unique UPI reference IDs</small></article>
        </section>

        <section className={styles.analyticsGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>Three-month movement</span><h3>Cash-flow timeline</h3></div><small>Sent vs received</small></div>
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChart} barGap={5}>
                  <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-inset)', border: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)' }} formatter={(value) => money.format(Number(value))} />
                  <Bar dataKey="spent" name="Sent" fill="var(--amber)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="received" name="Received" fill="var(--lime)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>Outflow allocation · suggestions need review</span><h3>Category breakdown</h3></div><small>{data ? money.format(data.totals.spent) : '—'}</small></div>
            <div className={styles.categoryList}>
              {(data?.categories ?? []).map((item) => {
                const percent = data?.totals.spent ? Math.round((item.amount / data.totals.spent) * 100) : 0;
                return <div className={styles.categoryRow} key={item.name}>
                  <div><strong>{item.name}</strong><span>{money.format(item.amount)} · {percent}%</span></div>
                  <div className={styles.track}><span style={{ width: `${percent}%` }} /></div>
                </div>;
              })}
              {!loading && data?.categories.length === 0 && <div className={styles.empty}>No expenses in this month.</div>}
            </div>
          </article>
        </section>

        <section className={styles.ledgerPanel}>
          <div className={styles.panelHeading}>
            <div><span>Evidence ledger</span><h3>Transaction history</h3></div>
            <small>{filtered.length} shown</small>
          </div>
          <div className={styles.filters}>
            <label><input type="checkbox" checked={reviewOnly} onChange={e=>setReviewOnly(e.target.checked)}/> Needs review ({data?.transactions.filter(t=>t.needsReview).length ?? 0})</label>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search counterparty or UPI ID" />
            <select value={direction} onChange={(event) => setDirection(event.target.value as 'all' | Direction)}>
              <option value="all">All directions</option><option value="debit">Money sent</option><option value="credit">Money received</option>
            </select>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Date & time</th><th>Counterparty</th><th>Category</th><th>UPI reference</th><th>Flow</th><th>Amount</th></tr></thead>
              <tbody>
                {filtered.map((item) => <tr key={item.sourceId}>
                  <td>{new Date(item.occurredAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><strong>{item.merchant}</strong>{item.purpose && <p>{item.purpose}</p>}</td>
                  <td><span className={styles.categoryBadge}>{item.category}</span><p>{item.categorySource}</p><button onClick={()=>setEditing(item)}>Review / edit</button></td>
                  <td className={styles.reference}>{item.reference ?? '—'}</td>
                  <td><span className={item.direction === 'credit' ? styles.flowCredit : styles.flowDebit}>{item.direction === 'credit' ? 'Received' : 'Sent'}</span></td>
                  <td className={item.direction === 'credit' ? styles.amountCredit : styles.amountDebit}>{item.direction === 'credit' ? '+' : '−'}{money.format(item.amount)}</td>
                </tr>)}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && <div className={styles.empty}>No transactions match these filters.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
