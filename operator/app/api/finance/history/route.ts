import { NextRequest, NextResponse } from 'next/server';
import { getFinanceHistoryTransactions, getFinanceMonthSummaries } from '@/lib/finance/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const summaries = await getFinanceMonthSummaries();
    const requested = request.nextUrl.searchParams.get('month');
    const month = requested && /^\d{4}-\d{2}$/.test(requested)
      ? requested
      : summaries[0]?.month ?? new Date().toISOString().slice(0, 7);
    const transactions = await getFinanceHistoryTransactions(month);
    const spent = transactions.filter((item) => item.direction === 'debit').reduce((sum, item) => sum + item.amount, 0);
    const received = transactions.filter((item) => item.direction === 'credit').reduce((sum, item) => sum + item.amount, 0);
    const categoryMap = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.direction !== 'debit') continue;
      categoryMap.set(transaction.category, (categoryMap.get(transaction.category) ?? 0) + transaction.amount);
    }
    const categories = [...categoryMap.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    return NextResponse.json({
      month,
      summaries,
      totals: {
        spent: Math.round(spent * 100) / 100,
        received: Math.round(received * 100) / 100,
        net: Math.round((received - spent) * 100) / 100,
        transactionCount: transactions.length,
      },
      categories,
      transactions,
    });
  } catch (error) {
    console.error('[api/finance/history]', error);
    return NextResponse.json({ error: 'Failed to load finance history.' }, { status: 500 });
  }
}
