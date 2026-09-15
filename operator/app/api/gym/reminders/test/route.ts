import { NextRequest, NextResponse } from 'next/server';
import { sendGymReminderTest } from '@/lib/gym/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.SCHEDULER_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized test dispatch.' }, { status: 401 });
  try {
    const body = await request.json() as { date?: unknown };
    return NextResponse.json(await sendGymReminderTest(String(body.date ?? '')));
  } catch (error) {
    console.error('[api/gym/reminders/test POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test gym email failed.' }, { status: 400 });
  }
}
