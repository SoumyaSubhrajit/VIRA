import { NextRequest, NextResponse } from 'next/server';
import { dispatchGymReminders } from '@/lib/gym/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized gym reminder dispatch.' }, { status: 401 });
  try {
    return NextResponse.json(await dispatchGymReminders());
  } catch (error) {
    console.error('[api/gym/dispatch POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gym reminder dispatch failed.' }, { status: 500 });
  }
}
