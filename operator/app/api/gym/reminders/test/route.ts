import { NextRequest, NextResponse } from 'next/server';
import { sendGymReminderTest } from '@/lib/gym/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { date?: unknown };
    return NextResponse.json(await sendGymReminderTest(String(body.date ?? '')));
  } catch (error) {
    console.error('[api/gym/reminders/test POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test gym email failed.' }, { status: 400 });
  }
}
