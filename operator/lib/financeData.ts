import type { FinanceData, FinanceCategory } from './types';
import { getFinanceImportState, getFinanceTransactionsForMonth } from './finance/db';
import { fetchFoldSpendingSummary, fetchFoldTotalBalance, fetchFoldNetWorth } from './finance/foldClient';

const DEFAULT_BUDGETS: Record<string, number> = {
  Bill: 15000,
  'Food & Drinks': 10000,
  Transport: 5000,
  Groceries: 4000,
  Shopping: 3000,
  Subscription: 2000,
  Entertainment: 2000,
  Investment: 5000,
  Medical: 2000,
  Misc: 5000,
};

const MOCK: FinanceData = {
  month: new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
  totalSpent: 28400,
  totalBudget: 40000,
  savingsRate: 0.29,
  categories: [
    { name: 'Rent', spent: 12000, budget: 12000 },
    { name: 'Food', spent: 6200, budget: 8000 },
    { name: 'Transport', spent: 2100, budget: 2500 },
    { name: 'Gym', spent: 1500, budget: 1500 },
    { name: 'Entertainment', spent: 3200, budget: 3000 },
    { name: 'Misc', spent: 3400, budget: 5000 },
  ],
  isMock: true,
  source: 'mock',
};

export async function getFinanceData(_userId: string): Promise<FinanceData> {
  const now = new Date();

  // 1. Try querying Fold live spending summary & balances first
  try {
    const [spendingSummary, balanceData, netWorthData] = await Promise.all([
      fetchFoldSpendingSummary(now.getMonth() + 1, now.getFullYear()).catch(() => null),
      fetchFoldTotalBalance().catch(() => null),
      fetchFoldNetWorth().catch(() => null),
    ]);

    if (spendingSummary && spendingSummary.categories) {
      const categories: FinanceCategory[] = spendingSummary.categories.map((c) => ({
        name: c.category_name,
        spent: Math.round(c.amount),
        budget: DEFAULT_BUDGETS[c.category_name] ?? Math.max(Math.round(c.amount * 1.2), 1000),
      }));

      // Add untagged/misc if present
      if (spendingSummary.untagged && spendingSummary.untagged.amount > 0) {
        categories.push({
          name: 'Untagged / Other',
          spent: Math.round(spendingSummary.untagged.amount),
          budget: DEFAULT_BUDGETS['Misc'] ?? 5000,
        });
      }

      const totalBudget = categories.reduce((sum, c) => sum + c.budget, 0);
      const totalSpent = Math.round(spendingSummary.total_amount);
      const liquidBalance = balanceData?.total;
      const netWorth = netWorthData?.total;

      return {
        month: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
        totalSpent,
        totalBudget,
        savingsRate: totalBudget > totalSpent ? Math.max(0, (totalBudget - totalSpent) / totalBudget) : 0,
        categories,
        isMock: false,
        liquidBalance,
        netWorth,
        source: 'fold',
        lastImportAt: new Date().toISOString(),
      };
    }
  } catch (foldErr) {
    console.warn('[getFinanceData] Fold live query skipped, checking local SQLite:', foldErr);
  }

  // 2. Fallback to local SQLite transactions if available
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const transactions = await getFinanceTransactionsForMonth(start.toISOString(), end.toISOString());
  const importState = await getFinanceImportState();

  if (transactions.length === 0 && !importState.lastImportAt) {
    return MOCK;
  }

  const budgetByCategory: Record<string, number> = {
    Rent: 12000,
    Food: 8000,
    Transport: 2500,
    Gym: 1500,
    Entertainment: 3000,
    Misc: 5000,
  };
  const spentByCategory: Record<string, number> = Object.fromEntries(
    Object.keys(budgetByCategory).map((name) => [name, 0])
  );
  let income = 0;
  let totalSpent = 0;
  for (const transaction of transactions) {
    if (transaction.direction === 'credit') {
      income += transaction.amount;
    } else {
      totalSpent += transaction.amount;
      spentByCategory[transaction.category] = (spentByCategory[transaction.category] ?? 0) + transaction.amount;
    }
  }
  const totalBudget = Object.values(budgetByCategory).reduce((sum, value) => sum + value, 0);

  return {
    month: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
    totalSpent,
    totalBudget,
    savingsRate: income > 0 ? Math.max(0, (income - totalSpent) / income) : 0,
    categories: Object.entries(budgetByCategory).map(([name, budget]) => ({
      name,
      spent: spentByCategory[name] ?? 0,
      budget,
    })),
    isMock: false,
    transactionCount: transactions.length,
    lastImportAt: importState.lastImportAt,
    source: 'local',
  };
}
