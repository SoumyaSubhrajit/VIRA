import { NextRequest, NextResponse } from 'next/server';
import {
  fetchFoldRecentTransactions,
  fetchFoldSpendingSummary,
  fetchFoldTotalBalance,
  getFoldAccessToken,
  type FoldSpendingSummary,
} from '@/lib/finance/foldClient';
import {
  applyAiCategoriesToSummary,
  classifyUntaggedFoldTransactions,
} from '@/lib/finance/foldCategorizer';
import { getFinanceReportInsights } from '@/lib/finance/financeInsights';
import { getFinanceHistoryTransactions } from '@/lib/finance/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_BUDGETS: Record<string, number> = {
  Bill: 15000,
  'Food & Drinks': 10000,
  Transport: 5000,
  Groceries: 4000,
  Shopping: 3000,
  Subscription: 2000,
  Entertainment: 2000,
  Investment: 5000,
  'Medical': 2000,
  'Transfers & P2P': 10000,
  Other: 5000,
  Misc: 5000,
  'Untagged / Other': 5000,
};

function monthShort(monthNum: number): string {
  return new Date(2026, monthNum - 1, 1).toLocaleString('en-IN', { month: 'short' });
}

function monthLong(year: number, monthNum: number): string {
  return new Date(year, monthNum - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function buildCategoriesFromSummary(summary: FoldSpendingSummary | null) {
  if (!summary || !summary.categories) return [];
  const list = summary.categories.map((c) => ({
    name: c.category_name,
    spent: Math.round(c.amount),
    budget: DEFAULT_BUDGETS[c.category_name] ?? Math.max(Math.round(c.amount * 1.2), 1000),
  }));
  if (summary.untagged && summary.untagged.amount > 0) {
    list.push({
      name: 'Untagged / Other',
      spent: Math.round(summary.untagged.amount),
      budget: DEFAULT_BUDGETS['Untagged / Other'] ?? 5000,
    });
  }
  return list.sort((a, b) => b.spent - a.spent);
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const reqMonth = request.nextUrl.searchParams.get('month');
    const reqYear = Number(request.nextUrl.searchParams.get('year')) || currentYear;

    let selectedYear = reqYear;
    let selectedMonthNum = currentMonth;
    if (reqMonth && /^\d{4}-\d{2}$/.test(reqMonth)) {
      const [y, m] = reqMonth.split('-').map(Number);
      selectedYear = y;
      selectedMonthNum = m;
    }
    const selectedMonthKey = `${selectedYear}-${String(selectedMonthNum).padStart(2, '0')}`;

    // Ensure Fold token is ready (and refreshed once if needed) before parallel calls
    const token = await getFoldAccessToken();
    const foldConnected = Boolean(token);

    // 1. Fetch balance + selected month summary + recent transactions
    const [balanceData, selectedSummary, recentTxData] = foldConnected
      ? await Promise.all([
          fetchFoldTotalBalance().catch(() => null),
          fetchFoldSpendingSummary(selectedMonthNum, selectedYear).catch(() => null),
          fetchFoldRecentTransactions(200).catch(() => null),
        ])
      : [null, null, null];

    // 2. Fetch monthly summaries for the requested year (up to current month if current year)
    const maxMonth = reqYear === currentYear ? currentMonth : 12;
    const monthNumbers = Array.from({ length: maxMonth }, (_, i) => i + 1);

    const yearlySummaries = foldConnected
      ? await Promise.all(
          monthNumbers.map((m) =>
            m === selectedMonthNum && reqYear === selectedYear && selectedSummary
              ? Promise.resolve(selectedSummary)
              : fetchFoldSpendingSummary(m, reqYear).catch(() => null),
          ),
        )
      : monthNumbers.map(() => null);

    // Build monthly comparison rows
    const monthlyComparison = monthNumbers.map((m, idx) => {
      const summary = yearlySummaries[idx];
      const cats = buildCategoriesFromSummary(summary);
      const spent = summary ? Math.round(summary.total_amount) : 0;
      const budget = cats.length > 0 ? cats.reduce((s, c) => s + c.budget, 0) : 50000;
      const savingsRate = budget > spent && budget > 0 ? (budget - spent) / budget : 0;
      return {
        month: `${reqYear}-${String(m).padStart(2, '0')}`,
        monthNum: m,
        shortLabel: monthShort(m),
        fullLabel: monthLong(reqYear, m),
        spent,
        budget,
        savingsRate,
        categories: cats,
      };
    });

    // Build yearly aggregation
    const activeMonths = monthlyComparison.filter((m) => m.spent > 0);
    const yearlyTotalSpent = activeMonths.reduce((s, m) => s + m.spent, 0);
    const avgPerMonth = activeMonths.length > 0 ? Math.round(yearlyTotalSpent / activeMonths.length) : 0;
    const bestMonth = activeMonths.length > 0
      ? activeMonths.reduce((best, m) => (m.spent < best.spent ? m : best), activeMonths[0])
      : null;
    const worstMonth = activeMonths.length > 0
      ? activeMonths.reduce((worst, m) => (m.spent > worst.spent ? m : worst), activeMonths[0])
      : null;

    const yearCatMap = new Map<string, number>();
    for (const m of monthlyComparison) {
      for (const c of m.categories) {
        yearCatMap.set(c.name, (yearCatMap.get(c.name) ?? 0) + c.spent);
      }
    }
    const yearlyCategories = [...yearCatMap.entries()]
      .map(([name, spent]) => ({ name, spent }))
      .sort((a, b) => b.spent - a.spent);

    // Build date-wise transactions for the selected month
    const dailyMap = new Map<
      string,
      {
        date: string;
        label: string;
        totalSpent: number;
        items: Array<{ id: string; merchant: string; category: string; amount: number; time: string }>;
      }
    >();

    const foldTxList = recentTxData?.transactions ?? [];
    const monthDebitTx = foldTxList.filter(
      (tx) => tx.type === 'DEBIT' && tx.date.startsWith(selectedMonthKey),
    );

    // Auto-classify untagged transactions for the selected month (cached in SQLite)
    const aiCatMap = await classifyUntaggedFoldTransactions(monthDebitTx);

    if (monthDebitTx.length > 0) {
      for (const tx of monthDebitTx) {
        const dateKey = tx.date.slice(0, 10);
        const dt = new Date(tx.date);
        const label = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const amount = Math.round(tx.effective_amount || tx.amount);
        const merchant = tx.merchant_name || tx.narration || 'UPI Payment';
        const category = tx.category?.name || aiCatMap.get(tx.id) || 'Untagged';

        const group = dailyMap.get(dateKey) ?? { date: dateKey, label, totalSpent: 0, items: [] };
        group.totalSpent += amount;
        group.items.push({ id: tx.id, merchant, category, amount, time });
        dailyMap.set(dateKey, group);
      }
    } else {
      // Fallback to local SQLite transactions for selected month
      const localTx = await getFinanceHistoryTransactions(selectedMonthKey);
      for (const tx of localTx) {
        if (tx.direction !== 'debit') continue;
        const dateKey = tx.occurredAt.slice(0, 10);
        const dt = new Date(tx.occurredAt);
        const label = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const amount = Math.round(tx.amount);

        const group = dailyMap.get(dateKey) ?? { date: dateKey, label, totalSpent: 0, items: [] };
        group.totalSpent += amount;
        group.items.push({
          id: tx.sourceId,
          merchant: tx.merchant || 'Payment',
          category: tx.category || 'Misc',
          amount,
          time,
        });
        dailyMap.set(dateKey, group);
      }
    }

    const dailyGroups = [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date));

    // Selected month stats (with AI classification applied over Untagged)
    const baseSelectedCategories = (selectedSummary?.categories ?? []).map((c) => ({
      name: c.category_name,
      spent: Math.round(c.amount),
      budget: DEFAULT_BUDGETS[c.category_name] ?? Math.max(Math.round(c.amount * 1.2), 1000),
    }));
    const selectedCategories = selectedSummary
      ? applyAiCategoriesToSummary(
          baseSelectedCategories,
          selectedSummary.untagged?.amount ?? 0,
          monthDebitTx,
          aiCatMap,
          DEFAULT_BUDGETS,
        )
      : [];
    const selectedTotalSpent = selectedSummary
      ? Math.round(selectedSummary.total_amount)
      : dailyGroups.reduce((s, d) => s + d.totalSpent, 0);
    const selectedTotalBudget =
      selectedCategories.length > 0
        ? selectedCategories.reduce((s, c) => s + c.budget, 0)
        : 50000;
    const selectedSavingsRate =
      selectedTotalBudget > selectedTotalSpent && selectedTotalBudget > 0
        ? (selectedTotalBudget - selectedTotalSpent) / selectedTotalBudget
        : 0;

    const prevMonthSummary = monthlyComparison.find((m) => m.monthNum === selectedMonthNum - 1);
    const insights = await getFinanceReportInsights({
      monthKey: selectedMonthKey,
      monthSpent: selectedTotalSpent,
      monthBudget: selectedTotalBudget,
      prevMonthSpent: prevMonthSummary?.spent ?? null,
      topMonthCategories: selectedCategories.slice(0, 5).map((c) => ({ name: c.name, spent: c.spent })),
      year: reqYear,
      yearlyTotal: yearlyTotalSpent,
      yearlyAvg: avgPerMonth,
      bestMonth: bestMonth ? { label: bestMonth.fullLabel, spent: bestMonth.spent } : null,
      worstMonth: worstMonth ? { label: worstMonth.fullLabel, spent: worstMonth.spent } : null,
      topYearCategories: yearlyCategories.slice(0, 5),
    });

    return NextResponse.json({
      source: foldConnected && selectedSummary ? 'fold' : dailyGroups.length > 0 ? 'local' : 'none',
      foldConnected,
      liquidBalance: balanceData?.total ?? null,
      insights,
      thisMonth: {
        month: selectedMonthKey,
        label: monthLong(selectedYear, selectedMonthNum),
        totalSpent: selectedTotalSpent,
        totalBudget: selectedTotalBudget,
        savingsRate: selectedSavingsRate,
        categories: selectedCategories,
        dailyGroups,
      },
      monthlyReport: {
        year: reqYear,
        months: monthlyComparison.slice().reverse(),
        chart: monthlyComparison.filter((m) => m.spent > 0),
      },
      yearlyReport: {
        year: reqYear,
        availableYears: [currentYear, currentYear - 1],
        totalSpent: yearlyTotalSpent,
        avgPerMonth,
        bestMonth: bestMonth ? { label: bestMonth.fullLabel, spent: bestMonth.spent } : null,
        worstMonth: worstMonth ? { label: worstMonth.fullLabel, spent: worstMonth.spent } : null,
        categories: yearlyCategories,
        months: monthlyComparison,
      },
    });
  } catch (error) {
    console.error('[api/finance/report GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load finance report' },
      { status: 500 },
    );
  }
}
