import { NextRequest, NextResponse } from 'next/server';
import { getFullCalendar, updateGymDay } from '@/lib/gymData';

export async function GET() {
  try {
    const data = await getFullCalendar('default-user');
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/gym/calendar GET]', err);
    return NextResponse.json(
      { error: 'Failed to load calendar', detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, completed, notes, dayType, exercises } = body as {
      date: string;
      completed: boolean | null;
      notes: string;
      dayType?: string;
      exercises?: string;
    };

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    const result = await updateGymDay('default-user', date, completed, notes ?? '', dayType, exercises);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, locked: result.locked },
        { status: result.locked ? 423 : 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/gym/calendar PATCH]', err);
    return NextResponse.json(
      { error: 'Failed to update gym entry', detail: String(err) },
      { status: 500 }
    );
  }
}
