import { NextRequest, NextResponse } from 'next/server';
import { getTasksForDate, setDayPlanLocked, updateSchedulerSettings } from '@/lib/scheduler/db';

export const runtime = 'nodejs';

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { date?: unknown; locked?: unknown };
    if (!validDate(body.date)) {
      return NextResponse.json({ error: 'A valid plan date is required.' }, { status: 400 });
    }
    if (typeof body.locked !== 'boolean') {
      return NextResponse.json({ error: 'locked must be true or false.' }, { status: 400 });
    }

    const tasks = await getTasksForDate(body.date);
    if (body.locked && tasks.length === 0) {
      return NextResponse.json({ error: 'Add at least one task before locking the plan.' }, { status: 400 });
    }

    const plan = await setDayPlanLocked(body.date, body.locked);
    if (body.locked) {
      await updateSchedulerSettings({ checkInEnabled: true, checkInIntervalHours: 1 });
    }
    const completed = tasks.filter((task) => task.status === 'completed').length;
    return NextResponse.json({
      ...plan,
      progress: {
        completed,
        total: tasks.length,
        percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('[api/scheduler/plan PATCH]', error);
    return NextResponse.json({ error: 'Failed to update the daily plan lock.' }, { status: 500 });
  }
}
