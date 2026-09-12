import { NextRequest, NextResponse } from 'next/server';
import { getGoogleConnectionStatus } from '@/lib/google/auth';
import { syncDateToGoogle } from '@/lib/google/sync';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { date?: unknown };
    if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });
    }
    if (!(await getGoogleConnectionStatus()).connected) {
      return NextResponse.json({ error: 'Google account is not connected.' }, { status: 409 });
    }
    const results = await syncDateToGoogle(body.date);
    const failed = results.filter((item) => item.result.error).length;
    return NextResponse.json({ synced: results.length - failed, failed, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google sync failed.';
    console.error('[api/google/sync POST]', { message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
