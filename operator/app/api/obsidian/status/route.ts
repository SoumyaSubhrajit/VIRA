import { NextResponse } from 'next/server';
import { getObsidianStatus, updateObsidianSettings } from '@/lib/obsidian/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getObsidianStatus());
  } catch (error) {
    console.error('[api/obsidian/status GET]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load Obsidian settings.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { vaultPath?: unknown; enabled?: unknown };
    if (body.vaultPath !== undefined && typeof body.vaultPath !== 'string') {
      return NextResponse.json({ error: 'vaultPath must be a string.' }, { status: 400 });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false.' }, { status: 400 });
    }
    return NextResponse.json(await updateObsidianSettings({
      vaultPath: body.vaultPath as string | undefined,
      enabled: body.enabled as boolean | undefined,
    }));
  } catch (error) {
    console.error('[api/obsidian/status PATCH]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save Obsidian settings.' }, { status: 400 });
  }
}
