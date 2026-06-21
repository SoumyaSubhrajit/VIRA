import type { FinanceData } from './types';
import path from 'path';
import fs from 'fs';

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

export function getFinanceData(_userId: string): FinanceData {
  const financeFile = path.join(process.cwd(), 'data', 'finance.xlsx');
  if (fs.existsSync(financeFile)) {
    // TODO: implement real parsing when finance.xlsx is available
    // const rows = readSheetRaw('finance.xlsx', 'Sheet1');
    // return parseFinance(rows);
  }
  return MOCK;
}
