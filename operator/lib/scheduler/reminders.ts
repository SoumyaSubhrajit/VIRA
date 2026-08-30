import { Resend } from 'resend';
import { getPendingReminderTasks, getSchedulerSettings, markReminderSent } from './db';
import { PERSONALITY_BY_ID } from './personalities';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export interface ReminderDispatchResult {
  sent: number;
  failed: number;
  skipped: number;
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

  const tasks = getPendingReminderTasks(now);
  if (tasks.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const resend = new Resend(apiKey);
  let sent = 0;
  let failed = 0;
  for (const task of tasks) {
    const personality = PERSONALITY_BY_ID[task.personalityId];
    const response = await resend.emails.send({
      from: process.env.REMINDER_FROM_EMAIL || 'VIRA Scheduler <onboarding@resend.dev>',
      to: [settings.reminderEmail],
      subject: `[VIRA / ${personality.shortName.toUpperCase()}] ${task.startTime} — ${task.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#20231d">
          <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#68705e">VIRA daily command</p>
          <h1 style="font-size:24px;margin:8px 0">${escapeHtml(task.title)}</h1>
          <p><strong>${escapeHtml(task.startTime)}${task.endTime ? `–${escapeHtml(task.endTime)}` : ''}</strong> · ${escapeHtml(personality.shortName)}</p>
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
      markReminderSent(task.id, now.toISOString());
    }
  }
  return { sent, failed, skipped: 0 };
}
