import { Resend } from 'resend';
import { getGoogleTaskLink } from '@/lib/google/db';
import { sendWithConnectedGmail } from '@/lib/google/gmail';
import { syncTaskToGoogle } from '@/lib/google/sync';
import { getSchedulerDb } from '@/lib/scheduler/db';
import { getGymOsSnapshot } from './db';
import {
  claimGymReminder,
  completeGymReminder,
  ensureGymSchedulerTask,
  getGymReminderSettings,
  gymReminderSchedule,
  timeToMinutes,
} from './reminderStore';
import type { GymOsSnapshot, GymReminderScheduleItem, GymReminderSlot, GymSetLog } from './types';

type DeliveryResult = { sent: boolean; provider?: 'gmail' | 'resend'; error?: string };

export type DueGymReminder = {
  workoutDate: string;
  slot: GymReminderScheduleItem;
};

function zonedParts(now: Date, timezone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function getDueGymReminder(now: Date, snapshot: GymOsSnapshot): DueGymReminder | null {
  const current = zonedParts(now, snapshot.reminders.timezone);
  const schedule = gymReminderSchedule(snapshot.profile);
  const slot = schedule.find((item) => {
    const scheduled = timeToMinutes(item.time);
    return current.minutes >= scheduled && current.minutes <= scheduled + 9;
  });
  return slot ? { workoutDate: current.date, slot } : null;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function time12(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function phaseCopy(slot: GymReminderSlot, snapshot: GymOsSnapshot, nextExercise: string, completed: number, total: number) {
  if (slot === 'briefing') return {
    subject: `GYM BRIEF // ${snapshot.todayTemplate.name.toUpperCase()} // ${snapshot.todayTemplate.exercises.length} MOVEMENTS`,
    headline: 'Tonight’s work is already decided.',
    directive: `Train ${snapshot.todayTemplate.focus}. Review the previous numbers below, prepare the load progression, and arrive ready to execute—not improvise.`,
  };
  if (slot === 'launch') return {
    subject: `MOVE NOW // ${snapshot.todayTemplate.name.toUpperCase()} // START IN 5`,
    headline: 'Five minutes. Move.',
    directive: `Close what you are doing, take the gym kit, and begin ${nextExercise}. The starting decision has already been made.`,
  };
  if (slot === 'checkpoint-1') return {
    subject: `[${completed}/${total} SETS] CHECKPOINT 1/3 // ${snapshot.todayTemplate.name.toUpperCase()}`,
    headline: 'Opening checkpoint.',
    directive: `Log the work already completed. Next movement: ${nextExercise}. Keep the reps controlled and record pain instead of ignoring it.`,
  };
  if (slot === 'checkpoint-2') return {
    subject: `[${completed}/${total} SETS] CHECKPOINT 2/3 // HOLD THE STANDARD`,
    headline: 'Half-time audit.',
    directive: `You have logged ${completed} of ${total} target working sets. Continue with ${nextExercise}; do not trade form and useful tension for rushed volume.`,
  };
  if (slot === 'checkpoint-3') return {
    subject: `[${completed}/${total} SETS] CHECKPOINT 3/3 // CLOSE THE SESSION`,
    headline: 'Final working block.',
    directive: `Finish the remaining quality sets beginning with ${nextExercise}. No junk volume. Every completed set must exist in VIRA.`,
  };
  return {
    subject: `DEBRIEF REQUIRED // ${snapshot.todayTemplate.name.toUpperCase()} // LOG THE RESULT`,
    headline: snapshot.todaySession?.status === 'completed' ? 'Session closed. Review the evidence.' : 'Training time is over. Close the record.',
    directive: snapshot.todaySession?.status === 'completed'
      ? `Your session is marked complete with ${completed} working sets. Review pain, mental fatigue and notes while the details are still accurate.`
      : `Open VIRA now. Log missing sets, duration, post-workout pain, mental fatigue and what changed during the session. Unrecorded work cannot guide the next progression.`,
  };
}

async function previousSets(exerciseName: string, date: string): Promise<{ date: string; sets: GymSetLog[] } | null> {
  const database = await getSchedulerDb();
  const latest = await database.prepare(`
    SELECT MAX(g.session_date) AS session_date
    FROM gym_set_logs s JOIN gym_sessions g ON g.id=s.session_id
    WHERE g.user_id='default-user' AND g.session_date<? AND lower(s.exercise_name)=lower(?) AND s.warmup=0
  `).get(date, exerciseName) as { session_date: string | null };
  if (!latest.session_date) return null;
  const rows = await database.prepare(`
    SELECT s.id,s.template_exercise_id,s.exercise_name,s.set_number,s.weight_kg,s.reps,s.rir,s.pain,s.warmup,s.notes,s.logged_at
    FROM gym_set_logs s JOIN gym_sessions g ON g.id=s.session_id
    WHERE g.user_id='default-user' AND g.session_date=? AND lower(s.exercise_name)=lower(?) AND s.warmup=0
    ORDER BY s.set_number
  `).all(latest.session_date, exerciseName) as Array<Record<string, unknown>>;
  return {
    date: latest.session_date,
    sets: rows.map((row) => ({
      id: String(row.id), exerciseId: row.template_exercise_id ? String(row.template_exercise_id) : null,
      exerciseName: String(row.exercise_name), setNumber: Number(row.set_number), weightKg: Number(row.weight_kg), reps: Number(row.reps),
      rir: Number(row.rir), pain: Number(row.pain), warmup: Boolean(row.warmup), notes: String(row.notes ?? ''), loggedAt: String(row.logged_at),
      volumeKg: Number(row.weight_kg) * Number(row.reps), estimatedOneRepMax: Number(row.weight_kg) * (1 + Number(row.reps) / 30),
    })),
  };
}

async function performanceFor(snapshot: GymOsSnapshot, exerciseName: string): Promise<{ label: string; sets: GymSetLog[] } | null> {
  const current = snapshot.todaySession?.sets.filter((set) => !set.warmup && set.exerciseName.toLowerCase() === exerciseName.toLowerCase()) ?? [];
  if (current.length) return { label: 'Tonight', sets: current };
  const previous = await previousSets(exerciseName, snapshot.date);
  return previous ? { label: `Last · ${previous.date}`, sets: previous.sets } : null;
}

async function emailContent(slot: GymReminderSlot, snapshot: GymOsSnapshot): Promise<{ subject: string; html: string; text: string }> {
  const total = snapshot.todayTemplate.exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0);
  const completed = snapshot.todaySession?.sets.filter((set) => !set.warmup).length ?? 0;
  const nextExercise = snapshot.todayTemplate.exercises.find((exercise) => {
    const logged = snapshot.todaySession?.sets.filter((set) => !set.warmup && set.exerciseName.toLowerCase() === exercise.name.toLowerCase()).length ?? 0;
    return logged < exercise.targetSets;
  })?.name ?? 'session debrief';
  const copy = phaseCopy(slot, snapshot, nextExercise, completed, total);
  const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 100;
  const muscles = Array.from(new Set(snapshot.todayTemplate.exercises.map((exercise) => exercise.muscleGroup))).join(' · ');
  const performances = new Map(await Promise.all(snapshot.todayTemplate.exercises.map(async (exercise) => [
    exercise.name.toLowerCase(),
    await performanceFor(snapshot, exercise.name),
  ] as const)));
  const rows = snapshot.todayTemplate.exercises.map((exercise, index) => {
    const performance = performances.get(exercise.name.toLowerCase());
    const setLine = performance?.sets.map((set) => `${set.weightKg}kg × ${set.reps} @RIR${set.rir}`).join(' · ') ?? 'No prior working-set record';
    return `<tr><td style="padding:14px 10px;border-bottom:1px solid #293020;color:#77806e;font-size:12px">${String(index + 1).padStart(2, '0')}</td><td style="padding:14px 10px;border-bottom:1px solid #293020"><strong style="color:#f2f3e8">${escapeHtml(exercise.name)}</strong><div style="color:#8f9786;font-size:12px;margin-top:4px">${escapeHtml(exercise.muscleGroup)} · ${exercise.targetSets} × ${exercise.minReps}-${exercise.maxReps} · ${exercise.restSeconds}s rest</div><div style="color:#b5dc42;font-size:12px;margin-top:6px">${escapeHtml(performance?.label ?? 'Last')}: ${escapeHtml(setLine)}</div></td></tr>`;
  }).join('');
  const schedule = gymReminderSchedule(snapshot.profile);
  const scheduleLine = schedule.map((item) => `${time12(item.time)} ${item.label}`).join(' · ');
  const appUrl = `${process.env.VERA_PUBLIC_URL || process.env.VERA_BASE_URL || 'http://127.0.0.1:3100'}/gym`;
  const html = `<!doctype html><html><body style="margin:0;background:#080a07;color:#f2f3e8;font-family:Arial,sans-serif"><div style="max-width:720px;margin:0 auto;padding:34px 18px"><div style="color:#b5dc42;font-size:12px;letter-spacing:3px;font-weight:800">VIRA // GYM COMMAND</div><h1 style="font-size:30px;line-height:1.05;margin:12px 0 8px">${escapeHtml(copy.headline)}</h1><p style="color:#9aa18f;line-height:1.65;margin:0 0 22px">${escapeHtml(copy.directive)}</p><div style="background:#12160f;border:1px solid #303823;border-left:4px solid #b5dc42;padding:18px;margin-bottom:18px"><div style="color:#f0ad45;font-size:11px;letter-spacing:2px">TARGET MUSCLES</div><div style="font-size:19px;font-weight:800;margin-top:7px">${escapeHtml(snapshot.todayTemplate.focus)}</div><div style="color:#8f9786;margin-top:6px">${escapeHtml(muscles)}</div></div><div style="display:flex;justify-content:space-between;color:#9aa18f;font-size:12px;margin-bottom:7px"><span>WORKING-SET PROGRESS</span><strong style="color:#f2f3e8">${completed}/${total} · ${percent}%</strong></div><div style="height:10px;background:#293020;margin-bottom:22px"><div style="height:10px;width:${percent}%;background:#b5dc42"></div></div><table role="presentation" style="width:100%;border-collapse:collapse;background:#10140d;border:1px solid #293020">${rows}</table><div style="margin-top:20px;padding:15px;background:#171b12;color:#9aa18f;font-size:12px;line-height:1.6"><strong style="color:#f0ad45">SEQUENCE</strong><br>${escapeHtml(scheduleLine)}</div><a href="${escapeHtml(appUrl)}" style="display:block;margin-top:18px;background:#b5dc42;color:#11150d;padding:15px;text-align:center;text-decoration:none;font-size:12px;font-weight:900;letter-spacing:2px">OPEN GYM OS →</a><p style="color:#5d6554;font-size:11px;margin-top:18px">Asia/Kolkata · Duplicate-safe dispatch · Gmail first, Resend fallback</p></div></body></html>`;
  const exerciseText = snapshot.todayTemplate.exercises.map((exercise, index) => {
    const performance = performances.get(exercise.name.toLowerCase());
    const sets = performance?.sets.map((set) => `${set.weightKg}kg x ${set.reps} @RIR${set.rir}`).join(' | ') ?? 'No prior record';
    return `${index + 1}. ${exercise.name} — ${exercise.muscleGroup} — ${exercise.targetSets} x ${exercise.minReps}-${exercise.maxReps}\n   ${performance?.label ?? 'Last'}: ${sets}`;
  }).join('\n');
  const text = `VIRA GYM COMMAND\n\n${copy.headline}\n${copy.directive}\n\nMUSCLES: ${snapshot.todayTemplate.focus}\nPROGRESS: ${completed}/${total} working sets (${percent}%)\n\n${exerciseText}\n\nSEQUENCE: ${scheduleLine}\n\nOPEN GYM OS: ${appUrl}`;
  return { subject: copy.subject, html, text };
}

async function deliver(input: { to: string; subject: string; html: string; text: string }): Promise<DeliveryResult> {
  const gmail = await sendWithConnectedGmail(input);
  if (gmail.sent) return { sent: true, provider: 'gmail' };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: gmail.error ?? 'Connected Gmail is unavailable and RESEND_API_KEY is not configured.' };
  const response = await new Resend(apiKey).emails.send({
    from: process.env.REMINDER_FROM_EMAIL || 'VIRA Gym <onboarding@resend.dev>',
    to: [input.to], subject: input.subject, html: input.html, text: input.text,
  });
  return response.error ? { sent: false, error: response.error.message } : { sent: true, provider: 'resend' };
}

async function synchronizeTask(snapshot: GymOsSnapshot) {
  const sync = await ensureGymSchedulerTask({ date: snapshot.date, profile: snapshot.profile, template: snapshot.todayTemplate, session: snapshot.todaySession });
  if (!sync.task) return;
  const link = await getGoogleTaskLink(sync.task.id);
  if (sync.changed || !link?.syncedAt) await syncTaskToGoogle(sync.task);
}

export async function dispatchGymReminders(now = new Date()) {
  const settings = await getGymReminderSettings();
  if (!settings.enabled || !settings.recipientEmail) return { status: 'disabled', sent: 0, failed: 0 };
  const local = zonedParts(now, settings.timezone);
  const snapshot = await getGymOsSnapshot(local.date);
  if (snapshot.todayTemplate.weekday === 0) return { status: 'rest-day', sent: 0, failed: 0 };
  await synchronizeTask(snapshot);
  const due = getDueGymReminder(now, snapshot);
  if (!due) return { status: 'not-due', sent: 0, failed: 0 };
  const claimed = await claimGymReminder({ workoutDate: due.workoutDate, slot: due.slot.slot, scheduledTime: due.slot.time, now });
  if (!claimed) return { status: 'already-attempted', slot: due.slot.slot, sent: 0, failed: 0 };
  const content = await emailContent(due.slot.slot, snapshot);
  const result = await deliver({ to: settings.recipientEmail, ...content });
  await completeGymReminder({ workoutDate: due.workoutDate, slot: due.slot.slot, sent: result.sent, provider: result.provider, error: result.error, now });
  return { status: result.sent ? 'sent' : 'failed', slot: due.slot.slot, provider: result.provider ?? null, sent: result.sent ? 1 : 0, failed: result.sent ? 0 : 1, error: result.error };
}

export async function sendGymReminderTest(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use a date in YYYY-MM-DD format.');
  const settings = await getGymReminderSettings();
  if (!settings.enabled) throw new Error('Gym emails are paused. Enable them before testing.');
  const snapshot = await getGymOsSnapshot(date);
  if (snapshot.todayTemplate.weekday === 0) throw new Error('Select a training day, not Sunday recovery.');
  await synchronizeTask(snapshot);
  const content = await emailContent('briefing', snapshot);
  const result = await deliver({ to: settings.recipientEmail, ...content, subject: `[TEST] ${content.subject}` });
  if (!result.sent) throw new Error(result.error ?? 'Test email failed.');
  return { sent: true, provider: result.provider, recipient: settings.recipientEmail };
}
