import { NextRequest, NextResponse } from 'next/server';
import { dispatchDueReminders } from '@/lib/scheduler/reminders';

export const runtime = 'nodejs';

function authorize(request: NextRequest): { ok: boolean; reason?: string } {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'SCHEDULER_SECRET must be configured in production.' };
    }
    return { ok: true };
  }
  return { ok: request.headers.get('authorization') === `Bearer ${secret}` };
}

export async function POST(request: NextRequest) {
  const authorization = authorize(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.reason ?? 'Unauthorized scheduler dispatch.' },
      { status: authorization.reason ? 503 : 401 }
    );
  }

  try {
    return NextResponse.json(await dispatchDueReminders());
  } catch (error) {
    console.error('[api/scheduler/dispatch POST]', error);
    return NextResponse.json({ error: 'Reminder dispatch failed.' }, { status: 500 });
  }
}
