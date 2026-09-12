import { NextRequest, NextResponse } from 'next/server';
import { getSchedulerSnapshot } from '@/lib/scheduler/db';

export const runtime = 'nodejs';

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') ?? '';
    if (!isValidDate(date)) {
      return NextResponse.json({ error: 'A valid date query in YYYY-MM-DD format is required.' }, { status: 400 });
    }
    return NextResponse.json(await getSchedulerSnapshot(date));
  } catch (error) {
    console.error('[api/scheduler GET]', error);
    return NextResponse.json({ error: 'Failed to load the daily scheduler.' }, { status: 500 });
  }
}
