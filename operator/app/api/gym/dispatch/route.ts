import { NextRequest, NextResponse } from 'next/server';
import { dispatchGymReminders } from '@/lib/gym/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.SCHEDULER_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function handleDispatch(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized gym reminder dispatch.' }, { status: 401 });
  try {
    return NextResponse.json(await dispatchGymReminders());
  } catch (error) {
    console.error('[api/gym/dispatch]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gym reminder dispatch failed.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleDispatch(request);
}

export async function POST(request: NextRequest) {
  return handleDispatch(request);
}
