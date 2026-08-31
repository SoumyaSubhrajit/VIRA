import { NextRequest, NextResponse } from 'next/server';
import { deleteTask, updateTask } from '@/lib/scheduler/db';
import { SchedulerValidationError, validateUpdateTask } from '@/lib/scheduler/validation';
import { deleteTaskFromGoogle, syncTaskToGoogle } from '@/lib/google/sync';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, context: RouteContext<'/api/scheduler/tasks/[id]'>) {
  try {
    const { id } = await context.params;
    const input = validateUpdateTask(await request.json());
    const task = updateTask(id, input);
    if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    const googleSync = await syncTaskToGoogle(task);
    return NextResponse.json({ ...task, googleSync });
  } catch (error) {
    if (error instanceof SchedulerValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[api/scheduler/tasks/:id PATCH]', error);
    return NextResponse.json({ error: 'Failed to update the task.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext<'/api/scheduler/tasks/[id]'>) {
  try {
    const { id } = await context.params;
    await deleteTaskFromGoogle(id).catch((error) => {
      console.error('[api/scheduler/tasks/:id DELETE google cleanup]', error);
    });
    if (!deleteTask(id)) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[api/scheduler/tasks/:id DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete the task.' }, { status: 500 });
  }
}
