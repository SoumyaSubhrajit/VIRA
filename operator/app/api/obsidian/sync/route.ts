import { NextResponse } from 'next/server';
import { syncObsidianVault } from '@/lib/obsidian/sync';
import { updateObsidianSettings } from '@/lib/obsidian/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { vaultPath?: unknown; date?: unknown };
    if (body.vaultPath !== undefined && typeof body.vaultPath !== 'string') {
      return NextResponse.json({ error: 'vaultPath must be a string.' }, { status: 400 });
    }
    if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
      return NextResponse.json({ error: 'date must use YYYY-MM-DD.' }, { status: 400 });
    }
    if (typeof body.vaultPath === 'string') await updateObsidianSettings({ vaultPath: body.vaultPath, enabled: true });
    return NextResponse.json(await syncObsidianVault({ date: body.date as string | undefined }));
  } catch (error) {
    console.error('[api/obsidian/sync POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Obsidian sync failed.' }, { status: 500 });
  }
}
