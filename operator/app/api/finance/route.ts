import { NextResponse } from 'next/server';
import { getFinanceData } from '@/lib/financeData';

export async function GET() {
  try {
    const data = getFinanceData('default-user');
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/finance]', err);
    return NextResponse.json(
      { error: 'Failed to load finance data', detail: String(err) },
      { status: 500 }
    );
  }
}
