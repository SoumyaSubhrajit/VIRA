import type { GymData, GymDay } from './types';
import { getGymOsSnapshot, getLegacyGymDays, updateLegacyGymDay } from './gym/db';

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

async function planDay(date: string): Promise<GymDay> {
  const snapshot = await getGymOsSnapshot(date);
  const session = snapshot.todaySession;
  return {
    date,
    weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    dayType: snapshot.todayTemplate.name,
    exercises: snapshot.todayTemplate.exercises.map((exercise) => `${exercise.name} - ${exercise.targetSets}x${exercise.minReps}-${exercise.maxReps}`),
    muscleFocus: snapshot.todayTemplate.focus,
    completed: session?.status === 'completed' ? true : session?.status === 'skipped' ? false : null,
    notes: session?.notes ?? '',
  };
}

export async function getGymData(_userId: string): Promise<GymData> {
  const today = localDate();
  const snapshot = await getGymOsSnapshot(today);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = offsetDate(today, -(dow === 0 ? 6 : dow - 1));
  const weekDays = await Promise.all(Array.from({ length: 6 }, (_, index) => planDay(offsetDate(monday, index))));
  const last7Days = await Promise.all(Array.from({ length: 7 }, (_, index) => planDay(offsetDate(today, index - 6))));
  return {
    today: await planDay(today),
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
