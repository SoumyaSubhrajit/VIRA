import { NextRequest, NextResponse } from 'next/server';
import { drainNotionOutbox, enqueueFullNotionSync } from '@/lib/notion/sync';
import { getNotionStatus } from '@/lib/notion/store';

export const runtime = 'nodejs';

function authorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULER_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { date?: unknown; reconcile?: unknown };
    let queued = 0;
    if (body.reconcile === true || typeof body.date === 'string') {
      queued = await enqueueFullNotionSync(typeof body.date === 'string' ? body.date : undefined);
    }
    const sync = await drainNotionOutbox();
    return NextResponse.json({ queued, ...sync, status: await getNotionStatus() });
  } catch (error) {
    console.error('[api/notion/sync POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Notion sync failed.' }, { status: 500 });
  }
}
