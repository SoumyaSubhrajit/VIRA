import { NextRequest, NextResponse } from 'next/server';
import { addCareerTask } from '@/lib/careerRoadmap';
import {
  getTechRadar,
  refreshTechRadar,
  toggleSaveRadarItem,
} from '@/lib/radar/techRadar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getTechRadar(true);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[api/radar GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load tech radar' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (action === 'refresh') {
      const data = await refreshTechRadar();
      return NextResponse.json(data);
    }

    if (action === 'toggle_save') {
      const updated = await toggleSaveRadarItem(String(body.id ?? ''));
      if (!updated) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      const data = await getTechRadar(false);
      return NextResponse.json(data);
    }

    if (action === 'send_to_career') {
      const title = String(body.title ?? '').trim();
      const howToUse = String(body.howToUse ?? '').trim();
      if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
      await addCareerTask({
        title: `Explore Tool: ${title}`,
        criteria: howToUse || 'Test this tool locally and summarize how it fits into your workflow.',
      });
      return NextResponse.json({ ok: true, message: `Added "${title}" to your active Career stage.` });
    }

    return NextResponse.json({ error: 'Unknown radar action' }, { status: 400 });
  } catch (error) {
    console.error('[api/radar POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Radar action failed' },
      { status: 400 },
    );
  }
}
