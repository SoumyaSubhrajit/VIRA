import { NextRequest, NextResponse } from 'next/server';
import { dispatchFinanceEmail } from '@/lib/finance/email';
import { dispatchGymReminders } from '@/lib/gym/reminders';
import { drainNotionOutbox } from '@/lib/notion/sync';
import { dispatchDueReminders } from '@/lib/scheduler/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.SCHEDULER_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function handleTick(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const names = ['scheduler', 'gym', 'finance', 'notion'] as const;
  const settled = await Promise.allSettled([
    dispatchDueReminders(),
    dispatchGymReminders(),
    dispatchFinanceEmail(),
    drainNotionOutbox(),
  ]);
  const results = Object.fromEntries(settled.map((result, index) => [
    names[index],
    result.status === 'fulfilled'
      ? { ok: true, result: result.value }
      : { ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
  ]));
  const failed = settled.filter((result) => result.status === 'rejected').length;
  return NextResponse.json({ ok: failed === 0, failed, results }, { status: failed === settled.length ? 500 : 200 });
}

export async function GET(request: NextRequest) {
  return handleTick(request);
}

export async function POST(request: NextRequest) {
  return handleTick(request);
}
