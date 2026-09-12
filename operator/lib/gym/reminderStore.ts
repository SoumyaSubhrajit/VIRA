import { getSchedulerDb, getSchedulerSettings, getTask, updateTask } from '@/lib/scheduler/db';
import type { SchedulerTask, TaskStatus } from '@/lib/scheduler/types';
import type {
  GymProfile,
  GymReminderDelivery,
  GymReminderScheduleItem,
  GymReminderSlot,
  GymReminderStatus,
  GymSession,
  GymWorkoutTemplate,
} from './types';

const USER_ID = 'default-user';
const DEFAULT_RECIPIENT = 'soumyasubhrajit@gmail.com';

type SettingsRow = {
  enabled: number;
  recipient_email: string;
  timezone: string;
};

type DeliveryRow = {
  slot: GymReminderSlot;
  scheduled_time: string;
  status: GymReminderDelivery['status'];
  provider: string | null;
  attempts: number;
  sent_at: string | null;
  error: string | null;
};

let initialization: Promise<void> | null = null;

async function initialize(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
  const database = await getSchedulerDb();
  await database.exec(`
    CREATE TABLE IF NOT EXISTS gym_reminder_settings (
      user_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      recipient_email TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gym_reminder_deliveries (
      user_id TEXT NOT NULL,
      workout_date TEXT NOT NULL,
      slot TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
      provider TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      sent_at TEXT,
      error TEXT,
      PRIMARY KEY (user_id, workout_date, slot)
    );

    CREATE INDEX IF NOT EXISTS idx_gym_reminder_deliveries_status
      ON gym_reminder_deliveries(user_id, status, workout_date);
  `);
  const schedulerEmail = (await getSchedulerSettings()).reminderEmail || DEFAULT_RECIPIENT;
  await database.prepare(`
    INSERT OR IGNORE INTO gym_reminder_settings(user_id,enabled,recipient_email,timezone,updated_at)
    VALUES(?,1,?,'Asia/Kolkata',?)
  `).run(USER_ID, schedulerEmail, new Date().toISOString());
  })();
  return initialization;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function gymReminderSchedule(profile: Pick<GymProfile, 'trainingStartTime' | 'sessionMinutes'>): GymReminderScheduleItem[] {
  const start = timeToMinutes(profile.trainingStartTime);
  const duration = profile.sessionMinutes;
  const checkpoints = [Math.round(duration / 6), Math.round(duration / 2), Math.round(duration * 5 / 6)];
  return [
    { slot: 'briefing', time: minutesToTime(start - 30), label: 'Workout briefing', purpose: 'Muscles, exercise order, targets and previous working sets.' },
    { slot: 'launch', time: minutesToTime(start - 5), label: 'Move now', purpose: 'Stop negotiating. Get to the gym and begin.' },
    { slot: 'checkpoint-1', time: minutesToTime(start + checkpoints[0]), label: 'Checkpoint 1 of 3', purpose: 'Confirm the opening working sets are logged.' },
    { slot: 'checkpoint-2', time: minutesToTime(start + checkpoints[1]), label: 'Checkpoint 2 of 3', purpose: 'Show live set progress and the next movement.' },
    { slot: 'checkpoint-3', time: minutesToTime(start + checkpoints[2]), label: 'Checkpoint 3 of 3', purpose: 'Final push: close remaining quality sets.' },
    { slot: 'debrief', time: minutesToTime(start + duration), label: 'Session debrief', purpose: 'Finish the session record, pain, fatigue and notes in VIRA.' },
  ];
}

export async function getGymReminderSettings(): Promise<{ enabled: boolean; recipientEmail: string; timezone: string }> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare('SELECT enabled,recipient_email,timezone FROM gym_reminder_settings WHERE user_id=?').get(USER_ID) as SettingsRow;
  return { enabled: row.enabled === 1, recipientEmail: row.recipient_email, timezone: row.timezone };
}

export async function saveGymReminderSettings(input: { enabled: boolean; recipientEmail: string }) {
  await initialize();
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new Error('Enter a valid gym reminder email address.');
  await (await getSchedulerDb()).prepare('UPDATE gym_reminder_settings SET enabled=?,recipient_email=?,updated_at=? WHERE user_id=?')
    .run(input.enabled ? 1 : 0, recipientEmail, new Date().toISOString(), USER_ID);
  return getGymReminderSettings();
}

function deliveryFromRow(row: DeliveryRow): GymReminderDelivery {
  return {
    slot: row.slot,
    scheduledTime: row.scheduled_time,
    status: row.status,
    provider: row.provider,
    attempts: row.attempts,
    sentAt: row.sent_at,
    error: row.error,
  };
}

export async function getGymReminderStatus(date: string, profile: GymProfile): Promise<GymReminderStatus> {
  const settings = await getGymReminderSettings();
  const rows = await (await getSchedulerDb()).prepare(`
    SELECT slot,scheduled_time,status,provider,attempts,sent_at,error
    FROM gym_reminder_deliveries WHERE user_id=? AND workout_date=? ORDER BY scheduled_time
  `).all(USER_ID, date) as DeliveryRow[];
  return {
    ...settings,
    schedule: gymReminderSchedule(profile),
    deliveries: rows.map(deliveryFromRow),
    schedulerTaskId: (await getTask(`gym-os:${date}`))?.id ?? null,
  };
}

function taskDetails(template: GymWorkoutTemplate, schedule: GymReminderScheduleItem[]): string {
  const exercises = template.exercises.map((exercise, index) =>
    `${index + 1}. ${exercise.name} — ${exercise.targetSets} × ${exercise.minReps}-${exercise.maxReps} · ${exercise.muscleGroup}`
  ).join('\n');
  return [
    `MUSCLE FOCUS: ${template.focus}`,
    exercises,
    `VIRA EMAIL SEQUENCE: ${schedule.map((item) => `${item.time} ${item.label}`).join(' · ')}`,
    'Log load, reps, RIR and pain for every working set. Close the session with duration, fatigue and notes.',
  ].join('\n\n');
}

function scheduledIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function endIso(date: string, startTime: string, durationMinutes: number): string {
  return new Date(new Date(scheduledIso(date, startTime)).getTime() + durationMinutes * 60_000).toISOString();
}

export async function ensureGymSchedulerTask(input: {
  date: string;
  profile: GymProfile;
  template: GymWorkoutTemplate;
  session: GymSession | null;
}): Promise<{ task: SchedulerTask | null; changed: boolean }> {
  if (input.template.weekday === 0) return { task: null, changed: false };
  await initialize();
  const database = await getSchedulerDb();
  const id = `gym-os:${input.date}`;
  const schedule = gymReminderSchedule(input.profile);
  const desired = {
    title: `Gym — ${input.template.name}`,
    details: taskDetails(input.template, schedule),
    taskDate: input.date,
    startTime: input.profile.trainingStartTime,
    endTime: schedule.find((item) => item.slot === 'debrief')?.time ?? input.profile.trainingStartTime,
    endAt: endIso(input.date, input.profile.trainingStartTime, input.profile.sessionMinutes),
    scheduledAt: scheduledIso(input.date, input.profile.trainingStartTime),
  };
  const existing = await getTask(id);
  const desiredStatus: TaskStatus = input.session?.status === 'completed' ? 'completed' : existing?.status ?? 'planned';
  const completedAt = input.session?.status === 'completed' ? input.session.completedAt ?? new Date().toISOString() : existing?.completedAt ?? null;

  if (!existing) {
    const now = new Date().toISOString();
    await database.prepare(`
      INSERT INTO scheduler_tasks(id,user_id,title,details,task_date,start_time,end_time,end_at,scheduled_at,personality_id,status,priority,
        reminder_minutes,reminder_channel,reminder_sent_at,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,'builder',?,1,0,'in_app',NULL,?,?,?)
    `).run(id, USER_ID, desired.title, desired.details, desired.taskDate, desired.startTime, desired.endTime, desired.endAt, desired.scheduledAt, desiredStatus, now, now, completedAt);
    return { task: await getTask(id), changed: true };
  }

  const changed = existing.title !== desired.title || existing.details !== desired.details || existing.startTime !== desired.startTime
    || existing.endTime !== desired.endTime || existing.endAt !== desired.endAt || existing.scheduledAt !== desired.scheduledAt
    || existing.status !== desiredStatus;
  if (changed) {
    await updateTask(id, { ...desired, personalityId: 'builder', priority: 1, reminderMinutes: 0, reminderChannel: 'in_app', status: desiredStatus });
  }
  return { task: await getTask(id), changed };
}

export async function claimGymReminder(input: { workoutDate: string; slot: GymReminderSlot; scheduledTime: string; now: Date }): Promise<boolean> {
  await initialize();
  const database = await getSchedulerDb();
  return database.transaction(async (transaction) => {
    const existing = await transaction.prepare(`
      SELECT status,attempts,last_attempt_at FROM gym_reminder_deliveries WHERE user_id=? AND workout_date=? AND slot=?
    `).get(USER_ID, input.workoutDate, input.slot) as { status: string; attempts: number; last_attempt_at: string | null } | undefined;
    if (existing?.status === 'sent' || (existing?.attempts ?? 0) >= 3) return false;
    if (existing?.status === 'sending' && existing.last_attempt_at && input.now.getTime() - new Date(existing.last_attempt_at).getTime() < 5 * 60_000) return false;
    await transaction.prepare(`
      INSERT INTO gym_reminder_deliveries(user_id,workout_date,slot,scheduled_time,status,provider,attempts,last_attempt_at,sent_at,error)
      VALUES(?,?,?,?,'sending',NULL,1,?,NULL,NULL)
      ON CONFLICT(user_id,workout_date,slot) DO UPDATE SET status='sending',provider=NULL,attempts=attempts+1,last_attempt_at=excluded.last_attempt_at,error=NULL
    `).run(USER_ID, input.workoutDate, input.slot, input.scheduledTime, input.now.toISOString());
    return true;
  })();
}

export async function completeGymReminder(input: { workoutDate: string; slot: GymReminderSlot; sent: boolean; provider?: string; error?: string; now?: Date }) {
  const now = input.now ?? new Date();
  await (await getSchedulerDb()).prepare(`
    UPDATE gym_reminder_deliveries SET status=?,provider=?,sent_at=?,error=? WHERE user_id=? AND workout_date=? AND slot=?
  `).run(input.sent ? 'sent' : 'failed', input.provider ?? null, input.sent ? now.toISOString() : null, input.error?.slice(0, 1000) ?? null, USER_ID, input.workoutDate, input.slot);
}
