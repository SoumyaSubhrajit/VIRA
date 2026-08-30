import { Resend } from 'resend';
import {
  getPendingReminderTasks,
  getSchedulerSettings,
  getTasksForDate,
  markCheckInSent,
  markReminderSent,
} from './db';
import { PERSONALITY_BY_ID } from './personalities';
import type { SchedulerSettings, SchedulerTask } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
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
    const response = await resend.emails.send({
      from,
      to: [settings.reminderEmail],
      subject: `[VIRA / ${personality.shortName.toUpperCase()}] ${formatTime12(task.startTime)} — ${task.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20231d">
          <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#68705e">VIRA daily command</p>
          <h1 style="font-size:24px;margin:8px 0">${escapeHtml(task.title)}</h1>
          <p><strong>${escapeHtml(formatTime12(task.startTime))}${task.endTime ? `–${escapeHtml(formatTime12(task.endTime))}` : ''}</strong> · ${escapeHtml(personality.shortName)}</p>
          <p style="padding:14px;background:#f2f4ed;border-left:4px solid #718c26">${escapeHtml(personality.identityStatement)}</p>
          ${task.details ? `<p>${escapeHtml(task.details).replaceAll('\n', '<br/>')}</p>` : ''}
          <p style="font-size:12px;color:#68705e">Reminder sent ${task.reminderMinutes} minute${task.reminderMinutes === 1 ? '' : 's'} before the scheduled task.</p>
        </div>
      `,
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
    const response = await resend.emails.send({
      from,
      to: [settings.reminderEmail],
      subject: `[VIRA CHECK-IN] Return to the work — ${formatTime12(slotTime)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20231d">
          <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#68705e">VIRA · two-hour focus reset</p>
          <h1 style="font-size:24px;margin:8px 0">Stop drifting. Return to the work.</h1>
          ${focusTask && personality ? `
            <p>Your ${new Date(focusTask.scheduledAt).getTime() <= now.getTime() ? 'current' : 'next'} commitment:</p>
            <p style="padding:14px;background:#f2f4ed;border-left:4px solid #718c26">
              <strong>${escapeHtml(formatTime12(focusTask.startTime))} — ${escapeHtml(focusTask.title)}</strong><br/>
              ${escapeHtml(personality.shortName)}: ${escapeHtml(personality.identityStatement)}
            </p>
          ` : '<p>No task is scheduled. Decide the single concrete outcome for the next two hours and put it in Daily Command now.</p>'}
          <ol>
            <li>What did you actually finish in the last two hours?</li>
            <li>What one measurable result will be finished in the next two?</li>
            <li>Is your current action serving that result—or avoiding it?</li>
          </ol>
          <p style="font-size:12px;color:#68705e">Scheduled every ${settings.checkInIntervalHours} hours, ${escapeHtml(formatTime12(settings.checkInStartTime))}–${escapeHtml(formatTime12(settings.checkInEndTime))} (${escapeHtml(settings.timezone)}).</p>
        </div>
      `,
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
