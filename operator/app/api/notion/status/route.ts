import { NextResponse } from 'next/server';
import { getNotionStatus } from '@/lib/notion/store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(await getNotionStatus());
  } catch (error) {
    console.error('[api/notion/status GET]', error);
    return NextResponse.json({ error: 'Failed to read Notion status.' }, { status: 500 });
  }
}
