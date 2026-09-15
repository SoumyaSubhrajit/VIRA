import type { GymData, GymDay } from './types';
import { getGymOsSnapshot, getLegacyGymDays, updateLegacyGymDay } from './gym/db';
import type { GymOsSnapshot, GymWorkoutTemplate } from './gym/types';

function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function offsetDate(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function planDay(
  date: string,
  template: GymWorkoutTemplate,
  status: 'planned' | 'in_progress' | 'completed' | 'skipped' | null,
  notes = '',
): GymDay {
  return {
    date,
    weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    dayType: template.name,
    exercises: template.exercises.map((exercise) => `${exercise.name} - ${exercise.targetSets}x${exercise.minReps}-${exercise.maxReps}`),
    muscleFocus: template.focus,
    completed: status === 'completed' ? true : status === 'skipped' ? false : null,
    notes,
  };
}

function templateForDate(snapshot: GymOsSnapshot, date: string): GymWorkoutTemplate {
  return snapshot.week.find((item) => item.date === date)?.template
    ?? snapshot.templates.find((item) => item.weekday === new Date(`${date}T12:00:00Z`).getUTCDay())
    ?? snapshot.todayTemplate;
}

function planDayFromSnapshot(snapshot: GymOsSnapshot, date: string): GymDay {
  const scheduled = snapshot.week.find((item) => item.date === date);
  const activity = snapshot.activity.find((item) => item.date === date);
  const isToday = date === snapshot.date;
  return planDay(
    date,
    templateForDate(snapshot, date),
    scheduled?.sessionStatus ?? activity?.status ?? null,
    isToday ? snapshot.todaySession?.notes ?? '' : '',
  );
}

export async function getGymData(_userId: string): Promise<GymData> {
  const today = localDate();
  const snapshot = await getGymOsSnapshot(today);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = offsetDate(today, -(dow === 0 ? 6 : dow - 1));
  // The dashboard only needs the compact view. Reuse one OS snapshot instead
  // of opening a new Turso query chain for every calendar cell.
  const weekDays = Array.from({ length: 6 }, (_, index) => planDayFromSnapshot(snapshot, offsetDate(monday, index)));
  const last7Days = Array.from({ length: 7 }, (_, index) => planDayFromSnapshot(snapshot, offsetDate(today, index - 6)));
  return {
    today: planDayFromSnapshot(snapshot, today),
    weekDays,
    last7Days,
    weekCompletion: snapshot.trends.completedThisWeek,
    weekTotal: snapshot.trends.plannedThisWeek,
    currentStreak: snapshot.trends.streak,
  };
}

export async function getFullCalendar(_userId: string): Promise<GymDay[]> {
  return getLegacyGymDays();
}

export type UpdateResult =
  | { ok: true }
  | { ok: false; locked: boolean; error: string };

export async function updateGymDay(
  _userId: string,
  date: string,
  completed: boolean | null,
  notes: string,
  dayType?: string,
  exercises?: string,
): Promise<UpdateResult> {
  const updated = await updateLegacyGymDay({ date, completed, notes, dayType, exercises });
  return updated
    ? { ok: true }
    : { ok: false, locked: false, error: `No imported training entry found for ${date}.` };
}
