import { NextRequest, NextResponse } from 'next/server';
import { bootstrapNotionWorkspace } from '@/lib/notion/bootstrap';
import { enqueueFullNotionSync, drainNotionOutbox } from '@/lib/notion/sync';
import { getNotionStatus } from '@/lib/notion/store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { parentPage?: unknown };
    if (typeof body.parentPage !== 'string' || !body.parentPage.trim()) {
      return NextResponse.json({ error: 'A Notion parent page URL or ID is required.' }, { status: 400 });
    }
    await bootstrapNotionWorkspace(body.parentPage);
    await enqueueFullNotionSync();
    const sync = await drainNotionOutbox();
    return NextResponse.json({ status: await getNotionStatus(), sync }, { status: 201 });
  } catch (error) {
    console.error('[api/notion/bootstrap POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to build the Notion workspace.' }, { status: 500 });
  }
}
