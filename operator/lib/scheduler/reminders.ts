import { Resend } from 'resend';
import { sendWithConnectedGmail } from '@/lib/google/gmail';
import {
  getDayPlan,
  getPendingReminderTasks,
  getSchedulerSettings,
  getTasksForDate,
  markDayPlanHourlySent,
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
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
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

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export interface DueCheckInSlot {
  slotKey: string;
  slotTime: string;
  planDate: string;
}

/** Returns the locked-plan date and local-time slot when an hourly email is due. */
export function getDueCheckInSlot(now: Date, settings: SchedulerSettings): DueCheckInSlot | null {
  if (!settings.checkInEnabled) return null;
  const current = zonedParts(now, settings.timezone);
  const start = timeToMinutes(settings.checkInStartTime);
  const end = timeToMinutes(settings.checkInEndTime);
  const interval = settings.checkInIntervalHours * 60;
  let planDate = current.dateKey;
  let elapsed: number;
  let duration: number;

  if (start <= end) {
    if (current.minutes < start || current.minutes > end) return null;
    elapsed = current.minutes - start;
    duration = end - start;
  } else if (current.minutes >= start) {
    elapsed = current.minutes - start;
    duration = (1440 - start) + end;
  } else if (current.minutes <= end) {
    planDate = addDays(current.dateKey, -1);
    elapsed = (1440 - start) + current.minutes;
    duration = (1440 - start) + end;
  } else {
    return null;
  }

  const slotOffset = Math.floor(elapsed / interval) * interval;
  if (slotOffset > duration || elapsed - slotOffset > 9) return null;
  const absoluteSlotMinutes = start + slotOffset;
  const slotDate = addDays(planDate, Math.floor(absoluteSlotMinutes / 1440));
  const slotTime = minutesToTime(absoluteSlotMinutes);
  return { slotKey: `${slotDate}T${slotTime}`, slotTime, planDate };
}

function taskForCheckIn(tasks: SchedulerTask[], now: Date): SchedulerTask | null {
  const planned = tasks.filter((task) => task.status === 'planned');
  return planned.find((task) => {
    const start = new Date(task.scheduledAt).getTime();
    const end = task.endAt
      ? new Date(task.endAt).getTime()
      : start + 60 * 60_000;
    return now.getTime() >= start && now.getTime() < end;
  }) ?? planned.find((task) => new Date(task.scheduledAt).getTime() > now.getTime()) ?? null;
}

function taskTimeLabel(task: SchedulerTask, timezone: string): string {
  if (!task.endTime) return formatTime12(task.startTime);
  const crossesMidnight = task.endAt
    ? zonedParts(new Date(task.endAt), timezone).dateKey !== task.taskDate
    : false;
  return `${formatTime12(task.startTime)} — ${formatTime12(task.endTime)}${crossesMidnight ? ' next day' : ''}`;
}

function planProgress(tasks: SchedulerTask[], timezone: string) {
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const total = tasks.length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    items: tasks.map((task) => ({
      title: task.title,
      timeLabel: taskTimeLabel(task, timezone),
      status: task.status,
      modeLabel: PERSONALITY_BY_ID[task.personalityId].shortName,
    })),
  };
}

function latestCompletionTime(tasks: SchedulerTask[]): number {
  return Math.max(0, ...tasks.map((task) => task.completedAt ? new Date(task.completedAt).getTime() : 0));
}

export interface ReminderDispatchResult {
  sent: number;
  failed: number;
  skipped: number;
  taskRemindersSent?: number;
  focusCheckInsSent?: number;
  reason?: string;
}

async function deliverEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  resend: Resend | null;
  from: string;
}): Promise<{ sent: boolean; error?: string }> {
  const gmail = await sendWithConnectedGmail(input);
  if (gmail.sent) return { sent: true };

  if (!input.resend) {
    return { sent: false, error: gmail.error ?? 'Neither connected Gmail nor RESEND_API_KEY is available.' };
  }
  const response = await input.resend.emails.send({
    from: input.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  return response.error ? { sent: false, error: response.error.message } : { sent: true };
}

export async function dispatchDueReminders(now = new Date()): Promise<ReminderDispatchResult> {
  const settings = getSchedulerSettings();
  if (!settings.emailEnabled || !settings.reminderEmail) {
    return { sent: 0, failed: 0, skipped: 1, reason: 'Email reminders are disabled or no reminder email is configured.' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  const from = process.env.REMINDER_FROM_EMAIL || 'VIRA Scheduler <onboarding@resend.dev>';
  const tasks = getPendingReminderTasks(now);
  let sent = 0;
  let failed = 0;
  let taskRemindersSent = 0;
  let focusCheckInsSent = 0;

  for (const task of tasks) {
    const personality = PERSONALITY_BY_ID[task.personalityId];
    const timeLabel = taskTimeLabel(task, settings.timezone);
    const subject = `MISSION BRIEF // ${formatTime12(task.startTime)} // ${task.title.toUpperCase()}`;
    const directive = `${personality.identityStatement}\n\nYou put this objective on the schedule. Execute it. Do not renegotiate with avoidance.`;
    const html = renderMissionEmail({
        kind: 'task',
        eyebrow: `${personality.shortName} assignment`,
        headline: 'Your objective is live.',
        objective: task.title,
        timeLabel,
        modeLabel: personality.shortName,
        priorityLabel: `P${task.priority}`,
        directive,
        details: task.details || undefined,
        scheduleLabel: `Task reminder · ${task.reminderMinutes} minute${task.reminderMinutes === 1 ? '' : 's'} before start · ${settings.timezone}`,
      });
    const response = await deliverEmail({
      to: settings.reminderEmail,
      subject,
      html,
      text: `VIRA MISSION BRIEF\n\nOBJECTIVE: ${task.title}\nTIME: ${timeLabel}\nMODE: ${personality.shortName} · P${task.priority}\n\n${directive}\n\n${task.details}`,
      resend,
      from,
    });

    if (!response.sent) {
      failed += 1;
      console.error('[scheduler/reminder] Send failed', { taskId: task.id, message: response.error });
    } else {
      sent += 1;
      taskRemindersSent += 1;
      markReminderSent(task.id, now.toISOString());
    }
  }

  const checkInSlot = getDueCheckInSlot(now, settings);
  if (checkInSlot) {
    const plan = getDayPlan(checkInSlot.planDate);
    const lastSent = plan.hourlyLastSentAt ? zonedParts(new Date(plan.hourlyLastSentAt), settings.timezone) : null;
    const lastSlotKey = lastSent ? `${lastSent.dateKey}T${minutesToTime(lastSent.minutes)}` : null;
    const planTasks = plan.locked ? getTasksForDate(checkInSlot.planDate) : [];
    const progress = planProgress(planTasks, settings.timezone);
    const allCompleted = progress.total > 0 && progress.completed === progress.total;
    const finalProgressAlreadySent = allCompleted
      && Boolean(plan.hourlyLastSentAt)
      && new Date(plan.hourlyLastSentAt as string).getTime() >= latestCompletionTime(planTasks);

    if (plan.locked && planTasks.length > 0 && (!lastSlotKey || lastSlotKey < checkInSlot.slotKey) && !finalProgressAlreadySent) {
      const focusTask = taskForCheckIn(planTasks, now);
      const personality = focusTask ? PERSONALITY_BY_ID[focusTask.personalityId] : null;
      const objective = allCompleted
        ? 'Locked plan complete. Every objective is closed.'
        : focusTask?.title ?? 'Resolve the remaining locked objectives.';
      const isCurrent = focusTask ? new Date(focusTask.scheduledAt).getTime() <= now.getTime() : false;
      const subject = `[${progress.percent}%] VIRA HOURLY STATUS // ${progress.completed}/${progress.total} COMPLETE // ${formatTime12(checkInSlot.slotTime)}`;
      const directive = allCompleted
        ? 'Execution complete. The locked plan is at 100%. Record what worked, then recover deliberately.'
        : focusTask && personality
          ? `${isCurrent ? 'Current' : 'Next'} commitment identified. ${personality.identityStatement}\n\nComplete the stated result. Do not confuse activity with completion.`
          : 'The plan remains locked and incomplete. Choose the earliest unfinished objective and close it now.';
      const html = renderMissionEmail({
        kind: 'check-in',
        eyebrow: 'Hourly locked-plan review',
        headline: allCompleted ? 'Plan complete. Standard met.' : 'One hour passed. Report results.',
        objective,
        timeLabel: focusTask
          ? taskTimeLabel(focusTask, settings.timezone)
          : `${formatTime12(checkInSlot.slotTime)} checkpoint`,
        modeLabel: personality?.shortName ?? 'Builder',
        priorityLabel: focusTask ? `P${focusTask.priority}` : 'DIRECTIVE',
        directive,
        details: focusTask?.details || undefined,
        progress,
        questions: [
          'What did you actually finish in the last hour?',
          'What exact result will be completed in the next hour?',
          'Is your current action serving that result—or avoiding it?',
        ],
        scheduleLabel: `Locked plan ${checkInSlot.planDate} · every ${settings.checkInIntervalHours} hour${settings.checkInIntervalHours === 1 ? '' : 's'} · ${formatTime12(settings.checkInStartTime)}–${formatTime12(settings.checkInEndTime)}${settings.checkInEndTime < settings.checkInStartTime ? ' next day' : ''} · ${settings.timezone}`,
      });
      const timeline = progress.items.map((item) => {
        const mark = item.status === 'completed' ? '[DONE]' : item.status === 'skipped' ? '[SKIPPED]' : '[OPEN]';
        return `${mark} ${item.timeLabel} · ${item.modeLabel} · ${item.title}`;
      }).join('\n');
      const response = await deliverEmail({
        to: settings.reminderEmail,
        subject,
        html,
        text: `VIRA HOURLY LOCKED-PLAN STATUS\n\nPROGRESS: ${progress.percent}% · ${progress.completed}/${progress.total} COMPLETE\n\n${timeline}\n\nCURRENT OBJECTIVE: ${objective}\nCHECKPOINT: ${formatTime12(checkInSlot.slotTime)}\nMODE: ${personality?.shortName ?? 'Builder'}\n\n${directive}\n\n1. What did you finish in the last hour?\n2. What exact result is next?\n3. Are you executing or avoiding?`,
        resend,
        from,
      });

      if (!response.sent) {
        failed += 1;
        console.error('[scheduler/check-in] Send failed', { slot: checkInSlot.slotKey, message: response.error });
      } else {
        sent += 1;
        focusCheckInsSent += 1;
        markDayPlanHourlySent(checkInSlot.planDate, now.toISOString());
      }
    }
  }

  return { sent, failed, skipped: 0, taskRemindersSent, focusCheckInsSent };
}
