import type { FinanceData } from './types';
import { getFinanceImportState, getFinanceTransactionsForMonth } from './finance/db';

// When finance.xlsx exists, swap the mock below for real parsing.
// Only this file needs to change — no UI or API route edits needed.

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
};

export async function getFinanceData(_userId: string): Promise<FinanceData> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const transactions = await getFinanceTransactionsForMonth(start.toISOString(), end.toISOString());
  const importState = await getFinanceImportState();
  if (transactions.length === 0 && !importState.lastImportAt) return MOCK;

  const budgetByCategory: Record<string, number> = {
    Rent: 12000, Food: 8000, Transport: 2500, Gym: 1500, Entertainment: 3000, Misc: 5000,
  };
  const spentByCategory: Record<string, number> = Object.fromEntries(
    Object.keys(budgetByCategory).map((name) => [name, 0])
  );
  let income = 0;
  let totalSpent = 0;
  for (const transaction of transactions) {
    if (transaction.direction === 'credit') income += transaction.amount;
    else {
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
      name, spent: spentByCategory[name] ?? 0, budget,
    })),
    isMock: false,
    transactionCount: transactions.length,
    lastImportAt: importState.lastImportAt,
  };
}
