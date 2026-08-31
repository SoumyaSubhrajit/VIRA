import { Resend } from 'resend';
import {
  getPendingReminderTasks,
  getSchedulerSettings,
  getTasksForDate,
  markCheckInSent,
  markReminderSent,
} from './db';
import { formatTime12, renderMissionEmail } from './emailTemplate';
import { PERSONALITY_BY_ID } from './personalities';
import type { SchedulerSettings, SchedulerTask } from './types';

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function zonedParts(now: Date, timezone: string): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Returns a local-time slot key when the recurring focus email is due. */
export function getDueCheckInSlot(now: Date, settings: SchedulerSettings): string | null {
  if (!settings.checkInEnabled) return null;
  const current = zonedParts(now, settings.timezone);
  const start = timeToMinutes(settings.checkInStartTime);
  const end = timeToMinutes(settings.checkInEndTime);
  const interval = settings.checkInIntervalHours * 60;
  if (current.minutes < start || current.minutes > end) return null;

  const slotMinutes = start + Math.floor((current.minutes - start) / interval) * interval;
  if (slotMinutes > end || current.minutes - slotMinutes > 9) return null;

  const slotKey = `${current.dateKey}T${minutesToTime(slotMinutes)}`;
  if (settings.checkInLastSentAt) {
    const last = zonedParts(new Date(settings.checkInLastSentAt), settings.timezone);
    const lastKey = `${last.dateKey}T${minutesToTime(last.minutes)}`;
    if (lastKey >= slotKey) return null;
  }
  return slotKey;
}

function taskForCheckIn(tasks: SchedulerTask[], now: Date): SchedulerTask | null {
  const planned = tasks.filter((task) => task.status === 'planned');
  return planned.find((task) => {
    const start = new Date(task.scheduledAt).getTime();
    const end = task.endTime
      ? new Date(`${task.taskDate}T${task.endTime}:00+05:30`).getTime()
      : start + 60 * 60_000;
    return now.getTime() >= start && now.getTime() < end;
  }) ?? planned.find((task) => new Date(task.scheduledAt).getTime() > now.getTime()) ?? null;
}

export interface ReminderDispatchResult {
  sent: number;
  failed: number;
  skipped: number;
  taskRemindersSent?: number;
  focusCheckInsSent?: number;
  reason?: string;
}

export async function dispatchDueReminders(now = new Date()): Promise<ReminderDispatchResult> {
  const settings = getSchedulerSettings();
  if (!settings.emailEnabled || !settings.reminderEmail) {
    return { sent: 0, failed: 0, skipped: 1, reason: 'Email reminders are disabled or no reminder email is configured.' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: 0, failed: 0, skipped: 1, reason: 'RESEND_API_KEY is not configured.' };
  }

  const resend = new Resend(apiKey);
  const from = process.env.REMINDER_FROM_EMAIL || 'VIRA Scheduler <onboarding@resend.dev>';
  const tasks = getPendingReminderTasks(now);
  let sent = 0;
  let failed = 0;
  let taskRemindersSent = 0;
  let focusCheckInsSent = 0;

  for (const task of tasks) {
    const personality = PERSONALITY_BY_ID[task.personalityId];
    const timeLabel = `${formatTime12(task.startTime)}${task.endTime ? ` — ${formatTime12(task.endTime)}` : ''}`;
    const response = await resend.emails.send({
      from,
      to: [settings.reminderEmail],
      subject: `MISSION BRIEF // ${formatTime12(task.startTime)} // ${task.title.toUpperCase()}`,
      html: renderMissionEmail({
        kind: 'task',
        eyebrow: `${personality.shortName} assignment`,
        headline: 'Your objective is live.',
        objective: task.title,
        timeLabel,
        modeLabel: personality.shortName,
        priorityLabel: `P${task.priority}`,
        directive: `${personality.identityStatement}\n\nYou put this objective on the schedule. Execute it. Do not renegotiate with avoidance.`,
        details: task.details || undefined,
        scheduleLabel: `Task reminder · ${task.reminderMinutes} minute${task.reminderMinutes === 1 ? '' : 's'} before start · ${settings.timezone}`,
      }),
    });

    if (response.error) {
      failed += 1;
      console.error('[scheduler/reminder] Send failed', { taskId: task.id, message: response.error.message });
    } else {
      sent += 1;
      taskRemindersSent += 1;
      markReminderSent(task.id, now.toISOString());
    }
  }

  const checkInSlot = getDueCheckInSlot(now, settings);
  if (checkInSlot) {
    const dateKey = checkInSlot.slice(0, 10);
    const slotTime = checkInSlot.slice(11);
    const focusTask = taskForCheckIn(getTasksForDate(dateKey), now);
    const personality = focusTask ? PERSONALITY_BY_ID[focusTask.personalityId] : null;
    const objective = focusTask?.title ?? 'Define and finish the next concrete outcome.';
    const isCurrent = focusTask ? new Date(focusTask.scheduledAt).getTime() <= now.getTime() : false;
    const response = await resend.emails.send({
      from,
      to: [settings.reminderEmail],
      subject: `VIRA DIRECTIVE // RETURN TO OBJECTIVE // ${formatTime12(slotTime)}`,
      html: renderMissionEmail({
        kind: 'check-in',
        eyebrow: 'Two-hour command review',
        headline: 'Stop drifting. Return to the objective.',
        objective,
        timeLabel: focusTask
          ? `${formatTime12(focusTask.startTime)}${focusTask.endTime ? ` — ${formatTime12(focusTask.endTime)}` : ''}`
          : `${formatTime12(slotTime)} checkpoint`,
        modeLabel: personality?.shortName ?? 'Builder',
        priorityLabel: focusTask ? `P${focusTask.priority}` : 'DIRECTIVE',
        directive: focusTask && personality
          ? `${isCurrent ? 'Current' : 'Next'} commitment identified. ${personality.identityStatement}\n\nFinish the measurable result. Motion without completion does not count.`
          : 'No objective is filed. Open Daily Command, choose the one result that matters, and commit the next two hours to finishing it.',
        details: focusTask?.details || undefined,
        questions: [
          'What did you actually finish in the last two hours?',
          'What one measurable result will be finished in the next two?',
          'Is your current action serving that result—or avoiding it?',
        ],
        scheduleLabel: `Automatic checkpoint every ${settings.checkInIntervalHours} hours · ${formatTime12(settings.checkInStartTime)}–${formatTime12(settings.checkInEndTime)} · ${settings.timezone}`,
      }),
    });

    if (response.error) {
      failed += 1;
      console.error('[scheduler/check-in] Send failed', { slot: checkInSlot, message: response.error.message });
    } else {
      sent += 1;
      focusCheckInsSent += 1;
      markCheckInSent(now.toISOString());
    }
  }

  return { sent, failed, skipped: 0, taskRemindersSent, focusCheckInsSent };
}
