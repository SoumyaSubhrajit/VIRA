import { NextRequest, NextResponse } from 'next/server';
import { applyGymAction, getGymOsSnapshot } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function todayInKolkata(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') || todayInKolkata();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Use a date in YYYY-MM-DD format.' }, { status: 400 });
    }
    return NextResponse.json(await getGymOsSnapshot(date));
  } catch (error) {
    console.error('[api/gym/os GET]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load Gym OS.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await applyGymAction(body));
  } catch (error) {
    console.error('[api/gym/os POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update Gym OS.' }, { status: 400 });
  }
}
