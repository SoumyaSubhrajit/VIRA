'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, Calendar, Eye, EyeOff, Palette, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { applyUiTheme, getSavedUiTheme, UI_THEMES, type UiTheme } from '@/lib/theme';

interface CategoryRow {
  name: string;
  spent: number;
  budget?: number;
}

interface DailyGroup {
  date: string;
  label: string;
  totalSpent: number;
  items: Array<{
    id: string;
    merchant: string;
    category: string;
    amount: number;
    time: string;
  }>;
}

interface MonthRow {
  month: string;
  monthNum: number;
  shortLabel: string;
  fullLabel: string;
  spent: number;
  budget: number;
  savingsRate: number;
  categories: CategoryRow[];
}

interface FinanceReportData {
  source: 'fold' | 'local' | 'none';
  foldConnected: boolean;
  liquidBalance: number | null;
  insights?: {
    monthly: string[];
    yearly: string[];
  };
  thisMonth: {
    month: string;
    label: string;
    totalSpent: number;
    totalBudget: number;
    savingsRate: number;
    categories: CategoryRow[];
    dailyGroups: DailyGroup[];
  };
  monthlyReport: {
    year: number;
    months: MonthRow[];
    chart: MonthRow[];
  };
  yearlyReport: {
    year: number;
    availableYears: number[];
    totalSpent: number;
    avgPerMonth: number;
    bestMonth: { label: string; spent: number } | null;
    worstMonth: { label: string; spent: number } | null;
    categories: CategoryRow[];
    months: MonthRow[];
  };
}

const rawInr = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

export default function FinancePage() {
  const [tab, setTab] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<FinanceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [showAllDays, setShowAllDays] = useState(false);
  const [theme, setTheme] = useState<UiTheme>('light');
  const [stealth, setStealth] = useState(false);

  useEffect(() => {
    const saved = getSavedUiTheme();
    setTheme(saved);
    applyUiTheme(saved);
    if (typeof window !== 'undefined') {
      setStealth(window.localStorage.getItem('vira-finance-stealth') === '1');
    }
  }, []);

  const formatInr = (amount: number) => (stealth ? '₹••••' : rawInr(amount));

  function toggleStealth() {
    setStealth((prev) => {
      const next = !prev;
      window.localStorage.setItem('vira-finance-stealth', next ? '1' : '0');
      return next;
    });
  }

  async function handleDisconnectFold() {
    if (!window.confirm('Disconnect Fold and revoke stored access tokens?')) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/finance/fold/disconnect', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Disconnect failed');
      setSyncNote(json.message);
      await loadReport(selectedMonth || undefined, selectedYear);
    } catch (err) {
      setSyncNote(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setSyncing(false);
    }
  }

  const loadReport = useCallback(async (monthParam?: string, yearParam?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (monthParam) params.set('month', monthParam);
      if (yearParam) params.set('year', String(yearParam));
      const res = await fetch(`/api/finance/report?${params.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as FinanceReportData;
      if (res.ok) {
        setData(json);
        if (!monthParam && json.thisMonth?.month) {
          setSelectedMonth(json.thisMonth.month);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(selectedMonth || undefined, selectedYear);
  }, [selectedMonth, selectedYear, loadReport]);

  async function handleSyncFold() {
    setSyncing(true);
    setSyncNote('');
    try {
      const res = await fetch('/api/finance/fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setSyncNote(`Synced ${json.importedCount ?? 0} new`);
      await loadReport(selectedMonth || undefined, selectedYear);
    } catch (err) {
      setSyncNote(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function handleThemeChange(nextTheme: UiTheme) {
    setTheme(nextTheme);
    applyUiTheme(nextTheme);
  }

  const thisMonth = data?.thisMonth;
  const budgetPct =
    thisMonth && thisMonth.totalBudget > 0
      ? Math.round((thisMonth.totalSpent / thisMonth.totalBudget) * 100)
      : 0;
  const remainingBudget = thisMonth ? thisMonth.totalBudget - thisMonth.totalSpent : 0;

  const visibleDays = showAllDays
    ? thisMonth?.dailyGroups ?? []
    : (thisMonth?.dailyGroups ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimal Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Operator
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-sm font-semibold tracking-tight">Finance</h1>
            {data?.source === 'fold' && <Badge variant="success">● Fold Live</Badge>}
            {data?.foldConnected && (
              <Badge variant="muted" title="Fold OAuth tokens & cache encrypted with AES-256-GCM">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                Encrypted
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!data?.foldConnected && !loading && (
              <a
                href="/api/finance/fold/auth"
                className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Connect Fold
              </a>
            )}
            <Button onClick={toggleStealth} variant="outline" size="sm" title={stealth ? 'Show amounts' : 'Hide sensitive amounts'}>
              {stealth ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {stealth ? 'Show ₹' : 'Hide ₹'}
            </Button>
            <Button onClick={handleSyncFold} disabled={syncing} variant="outline" size="sm">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing' : 'Sync'}
            </Button>
            {data?.foldConnected && (
              <Button onClick={handleDisconnectFold} disabled={syncing} variant="ghost" size="sm" title="Disconnect Fold & revoke tokens">
                <Unplug className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}

            {/* Configurable Theme Switcher */}
            <div className="relative flex items-center">
              <Palette className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                aria-label="UI Style"
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value as UiTheme)}
                className="h-8 rounded-lg border border-border bg-card pl-8 pr-2.5 text-xs font-medium text-foreground focus:outline-none"
              >
                {UI_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-5 py-8">
        {syncNote && (
          <div className="mb-4 text-xs font-medium text-emerald-600">{syncNote}</div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="month">This Month</TabsTrigger>
              <TabsTrigger value="monthly">Monthly Reports</TabsTrigger>
              <TabsTrigger value="yearly">Yearly Report</TabsTrigger>
            </TabsList>

            {tab === 'month' && data?.monthlyReport.months && (
              <select
                aria-label="Select month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground"
              >
                {data.monthlyReport.months.map((m) => (
                  <option key={m.month} value={m.month}>
                    {m.fullLabel}
                  </option>
                ))}
              </select>
            )}

            {tab !== 'month' && data?.yearlyReport.availableYears && (
              <select
                aria-label="Select year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground"
              >
                {data.yearlyReport.availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── VIEW 1: THIS MONTH ──────────────────────────────────────────── */}
          <TabsContent value="month" className="space-y-6">
            {/* Hero Budget Summary */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {thisMonth?.label ?? 'Loading...'}
                    </p>
                    <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
                      {thisMonth ? formatInr(thisMonth.totalSpent) : '—'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      spent of {thisMonth ? formatInr(thisMonth.totalBudget) : '—'} monthly budget
                    </p>
                  </div>

                  <div className="flex gap-6 text-right">
                    {typeof data?.liquidBalance === 'number' && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Bank Cash
                        </p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                          {formatInr(data.liquidBalance)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {remainingBudget >= 0 ? 'Remaining' : 'Over Budget'}
                      </p>
                      <p
                        className={`mt-0.5 text-lg font-semibold tabular-nums ${
                          remainingBudget >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {thisMonth ? formatInr(Math.abs(remainingBudget)) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Saved
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums">
                        {thisMonth ? `${Math.round(thisMonth.savingsRate * 100)}%` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-1.5">
                  <Progress
                    value={budgetPct}
                    indicatorClassName={
                      budgetPct > 100
                        ? 'bg-red-600'
                        : budgetPct > 85
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>{budgetPct}% of budget used</span>
                    <span>100%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Where It Went (Category Breakdown) */}
            <Card>
              <CardHeader>
                <CardTitle>Where it went</CardTitle>
                <CardDescription>Spending by category this month</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(thisMonth?.categories ?? []).map((cat) => {
                  const total = thisMonth?.totalSpent || 1;
                  const pctOfTotal = Math.round((cat.spent / total) * 100);
                  const pctOfBudget = cat.budget ? Math.round((cat.spent / cat.budget) * 100) : pctOfTotal;
                  const over = cat.budget ? cat.spent > cat.budget : false;

                  return (
                    <div key={cat.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{cat.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          <strong className="text-foreground">{formatInr(cat.spent)}</strong>
                          {cat.budget ? ` / ${formatInr(cat.budget)}` : ''} · {pctOfTotal}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, pctOfBudget)}
                        className="h-1.5"
                        indicatorClassName={over ? 'bg-red-500' : 'bg-emerald-600'}
                      />
                    </div>
                  );
                })}
                {!loading && (thisMonth?.categories.length ?? 0) === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No category data for this month yet.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Day-by-Day Spending */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Day by day</CardTitle>
                  <CardDescription>Where you spent, grouped by date</CardDescription>
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-5">
                {visibleDays.map((day) => (
                  <div key={day.date} className="space-y-2">
                    <div className="flex items-center justify-between border-b border-border pb-1.5 text-xs">
                      <span className="font-semibold text-foreground">{day.label}</span>
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {formatInr(day.totalSpent)}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {day.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-2 text-xs"
                        >
                          <div className="min-w-0 pr-4">
                            <p className="truncate font-medium text-foreground">{item.merchant}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.category} · {item.time}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {formatInr(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {!loading && (thisMonth?.dailyGroups.length ?? 0) === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No date-wise transactions found for this month. Click <strong>Sync</strong> to pull from Fold.
                  </p>
                )}

                {(thisMonth?.dailyGroups.length ?? 0) > 5 && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowAllDays((prev) => !prev)}
                  >
                    {showAllDays
                      ? 'Show fewer days'
                      : `Show all ${thisMonth?.dailyGroups.length} days`}
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── VIEW 2: MONTHLY REPORTS ─────────────────────────────────────── */}
          <TabsContent value="monthly" className="space-y-6">
            {(data?.insights?.monthly.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Key Takeaways</CardTitle>
                  <CardDescription>{thisMonth?.label} AI summary</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                    {data?.insights?.monthly.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>{selectedYear} Monthly Trend</CardTitle>
                <CardDescription>Total spent each month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.monthlyReport.chart ?? []}>
                      <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (stealth ? '••' : `₹${Math.round(v / 1000)}k`)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(val) => formatInr(Number(val))}
                      />
                      <Bar dataKey="spent" name="Spent" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Comparison</CardTitle>
                <CardDescription>Click any month to inspect its breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Month</span>
                    <span className="text-right">Spent</span>
                    <span className="text-right">Budget</span>
                    <span className="text-right">Saved</span>
                  </div>
                  {(data?.monthlyReport.months ?? [])
                    .filter((m) => m.spent > 0)
                    .map((m) => (
                      <button
                        key={m.month}
                        type="button"
                        onClick={() => {
                          setSelectedMonth(m.month);
                          setTab('month');
                        }}
                        className="grid w-full grid-cols-4 items-center py-3 text-left text-xs hover:bg-muted/60 transition-colors rounded-md px-1 cursor-pointer"
                      >
                        <span className="font-medium text-foreground">{m.fullLabel}</span>
                        <span className="text-right font-semibold tabular-nums">
                          {formatInr(m.spent)}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {formatInr(m.budget)}
                        </span>
                        <span
                          className={`text-right font-medium tabular-nums ${
                            m.savingsRate >= 0.15 ? 'text-emerald-600' : 'text-muted-foreground'
                          }`}
                        >
                          {Math.round(m.savingsRate * 100)}%
                        </span>
                      </button>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── VIEW 3: YEARLY REPORT ───────────────────────────────────────── */}
          <TabsContent value="yearly" className="space-y-6">
            {(data?.insights?.yearly.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>{selectedYear} Takeaways</CardTitle>
                  <CardDescription>Annual pattern summary</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                    {data?.insights?.yearly.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {selectedYear} Total
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {data ? formatInr(data.yearlyReport.totalSpent) : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Avg / Month
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {data ? formatInr(data.yearlyReport.avgPerMonth) : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Lowest Month
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600">
                    {data?.yearlyReport.bestMonth
                      ? formatInr(data.yearlyReport.bestMonth.spent)
                      : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {data?.yearlyReport.bestMonth?.label ?? ''}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Highest Month
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-amber-600">
                    {data?.yearlyReport.worstMonth
                      ? formatInr(data.yearlyReport.worstMonth.spent)
                      : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {data?.yearlyReport.worstMonth?.label ?? ''}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{selectedYear} Category Split</CardTitle>
                <CardDescription>Total spending across the full year</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data?.yearlyReport.categories ?? []).map((cat) => {
                  const total = data?.yearlyReport.totalSpent || 1;
                  const pct = Math.round((cat.spent / total) * 100);
                  return (
                    <div key={cat.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{cat.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          <strong className="text-foreground">{formatInr(cat.spent)}</strong> · {pct}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
                {!loading && (data?.yearlyReport.categories.length ?? 0) === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No yearly spending data available for {selectedYear}.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
