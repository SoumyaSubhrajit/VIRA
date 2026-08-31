import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/scheduler/db';
import { SchedulerValidationError, validateCreateTask } from '@/lib/scheduler/validation';
import { syncTaskToGoogle } from '@/lib/google/sync';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const input = validateCreateTask(await request.json());
    const task = createTask(input);
    const googleSync = await syncTaskToGoogle(task);
    return NextResponse.json({ ...task, googleSync }, { status: 201 });
  } catch (error) {
    if (error instanceof SchedulerValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[api/scheduler/tasks POST]', error);
    return NextResponse.json({ error: 'Failed to save the task.' }, { status: 500 });
  }
}
