import { NextRequest, NextResponse } from 'next/server';
import { getSchedulerSettings, updateSchedulerSettings } from '@/lib/scheduler/db';
import { SchedulerValidationError, validateEmail } from '@/lib/scheduler/validation';
import type { SchedulerSettings } from '@/lib/scheduler/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(getSchedulerSettings());
  } catch (error) {
    console.error('[api/scheduler/settings GET]', error);
    return NextResponse.json({ error: 'Failed to load reminder settings.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const update: Partial<Pick<SchedulerSettings, 'subjectName' | 'reminderEmail' | 'timezone' | 'emailEnabled' | 'browserEnabled'>> = {};

    if ('reminderEmail' in body) update.reminderEmail = validateEmail(body.reminderEmail);
    if ('subjectName' in body) {
      if (typeof body.subjectName !== 'string' || !body.subjectName.trim() || body.subjectName.trim().length > 80) {
        throw new SchedulerValidationError('subjectName must be between 1 and 80 characters.');
      }
      update.subjectName = body.subjectName.trim();
    }
    if ('timezone' in body) {
      if (body.timezone !== 'Asia/Kolkata') {
        throw new SchedulerValidationError('The current scheduler supports the Asia/Kolkata timezone.');
      }
      update.timezone = body.timezone;
    }
    for (const key of ['emailEnabled', 'browserEnabled'] as const) {
      if (key in body) {
        if (typeof body[key] !== 'boolean') throw new SchedulerValidationError(`${key} must be true or false.`);
        update[key] = body[key];
      }
    }
    if (Object.keys(update).length === 0) {
      throw new SchedulerValidationError('At least one settings field must be provided.');
    }
    return NextResponse.json(updateSchedulerSettings(update));
  } catch (error) {
    if (error instanceof SchedulerValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[api/scheduler/settings PATCH]', error);
    return NextResponse.json({ error: 'Failed to update reminder settings.' }, { status: 500 });
  }
}
