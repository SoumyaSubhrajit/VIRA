import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAgenda } from '@/lib/google/sync';

export const runtime = 'nodejs';

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (!validDate(date)) return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });
  try {
    return NextResponse.json(await getGoogleAgenda(date));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Google agenda.';
    const status = message.includes('not connected') ? 409 : 502;
    console.error('[api/google/agenda GET]', { message });
    return NextResponse.json({ error: message }, { status });
  }
}
