import { NextRequest, NextResponse } from 'next/server';
import { dispatchFinanceEmail } from '@/lib/finance/email';
import { dispatchGymReminders } from '@/lib/gym/reminders';
import { drainNotionOutbox } from '@/lib/notion/sync';
import { dispatchDueReminders } from '@/lib/scheduler/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULER_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
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
