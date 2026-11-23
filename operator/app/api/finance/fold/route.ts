import { NextRequest, NextResponse } from 'next/server';
import { syncFoldTransactions } from '@/lib/finance/foldSync';
import { fetchFoldTotalBalance, fetchFoldNetWorth, fetchFoldSpendingSummary } from '@/lib/finance/foldClient';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [balance, netWorth, summary] = await Promise.all([
      fetchFoldTotalBalance().catch(() => null),
      fetchFoldNetWorth().catch(() => null),
      fetchFoldSpendingSummary().catch(() => null),
    ]);

    return NextResponse.json({
      connected: true,
      balance,
      netWorth,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : 'Failed to query Fold MCP',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let limit = 100;
    try {
      const body = await request.json();
      if (typeof body?.limit === 'number' && body.limit > 0) {
        limit = body.limit;
      }
    } catch {
      // optional body
    }

    const result = await syncFoldTransactions(limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/finance/fold]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fold sync failed' },
      { status: 500 }
    );
  }
}
