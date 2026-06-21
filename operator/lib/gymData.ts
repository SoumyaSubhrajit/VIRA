import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { readSheetRaw, excelDateToDate } from './excelReader';
import type { GymData, GymDay, DayType } from './types';

const FILE_NAME = 'D:\\My_Proj\\VERA\\Data\\GYM\\gym_calendar.xlsx';
const SHEET = '6-Month Calendar';
const HEADER_ROW = 2;
const DATA_START = 3;

function gymFilePath(): string {
  return FILE_NAME;
}

function isFileLocked(): boolean {
  const dir = path.dirname(FILE_NAME);
  const base = path.basename(FILE_NAME);
  const lockFile = path.join(dir, `~$${base}`);
  return fs.existsSync(lockFile);
}

function parseExercises(raw: string | null): string[] {
  if (!raw) return [];
  if (raw.includes('\n')) {
    return raw.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  // Fallback: split by "1. ", "2. ", etc if they typed it all on one line without Alt+Enter
  return raw.split(/(?:\s+|^)(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function rowToGymDay(row: unknown[]): GymDay {
  const serial = row[0] as number;
  const date = excelDateToDate(serial);
  const completedRaw = row[5];
  let completed: boolean | null = null;
  if (typeof completedRaw === 'string') {
    const v = completedRaw.trim().toLowerCase();
    if (v === 'yes' || v === 'true') completed = true;
    else if (v === 'no' || v === 'false') completed = false;
  } else if (typeof completedRaw === 'number') {
    completed = completedRaw === 1;
  }
  return {
    date: toISODate(date),
    weekday: (row[1] as string) ?? '',
    dayType: (row[2] as DayType) ?? 'Rest',
    exercises: parseExercises(row[3] as string | null),
    muscleFocus: (row[4] as string) ?? '',
    completed,
    notes: (row[6] as string) ?? '',
  };
}

function getAllDays(): GymDay[] {
  const rows = readSheetRaw(FILE_NAME, SHEET);
  return rows
    .slice(DATA_START)
    .filter((row) => row[0] !== null && row[0] !== undefined && typeof row[0] === 'number')
    .map(rowToGymDay);
}

// ── Public: Dashboard summary ─────────────────────────────────────────────────

export function getGymData(_userId: string): GymData {
  const allDays = getAllDays();
  const today = new Date();
  
  // Shift to local timezone before calling toISOString
  const offset = today.getTimezoneOffset() * 60000;
  const localToday = new Date(today.getTime() - offset);
  const todayISO = localToday.toISOString().split('T')[0];

  const todayEntry = allDays.find((d) => d.date === todayISO) ?? null;

  // Current week Mon–Sat
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  const weekDays = allDays.filter((d) => {
    const dd = new Date(d.date + 'T00:00:00');
    return dd >= monday && dd <= saturday;
  });

  const weekCompletion = weekDays.filter((d) => d.completed === true && d.dayType !== 'Rest').length;
  const weekTotal = weekDays.filter((d) => d.dayType !== 'Rest').length;

  // Last 7 days
  const last7Days: GymDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = toISODate(d);
    const found = allDays.find((day) => day.date === iso);
    if (found) {
      last7Days.push(found);
    } else {
      last7Days.push({
        date: iso,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayType: 'Rest',
        exercises: [],
        muscleFocus: '',
        completed: null,
        notes: '',
      });
    }
  }

  // Streak: consecutive completed non-rest days backwards from today
  let currentStreak = 0;
  const sortedPast = [...allDays]
    .filter((d) => new Date(d.date + 'T00:00:00') <= today && d.dayType !== 'Rest')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (const day of sortedPast) {
    if (day.completed === true) currentStreak++;
    else break;
  }

  return { today: todayEntry, weekDays, last7Days, weekCompletion, weekTotal, currentStreak };
}

// ── Public: Full 6-month calendar ────────────────────────────────────────────

export function getFullCalendar(_userId: string): GymDay[] {
  return getAllDays();
}

// ── Public: Write completed + notes back to Excel ────────────────────────────

export type UpdateResult =
  | { ok: true }
  | { ok: false; locked: boolean; error: string };

export async function updateGymDay(
  _userId: string,
  date: string,
  completed: boolean | null,
  notes: string,
  dayType?: string,
  exercises?: string
): Promise<UpdateResult> {
  if (isFileLocked()) {
    return {
      ok: false,
      locked: true,
      error: 'gym.xlsx is currently open in Excel. Please close the file and try again.',
    };
  }

  try {
    const filePath = gymFilePath();
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const ws = workbook.getWorksheet(SHEET);
    if (!ws) throw new Error(`Sheet "${SHEET}" not found.`);

    // Find the row index
    let targetRow: any = null;
    ws.eachRow((row: any, rowNumber: number) => {
      if (rowNumber >= DATA_START + 1) { // exceljs is 1-indexed, DATA_START is 3, so row 4
        const dateCell = row.getCell(1).value;
        if (dateCell instanceof Date) {
          if (toISODate(dateCell) === date) {
            targetRow = row;
          }
        } else if (typeof dateCell === 'number') {
           // Fallback in case exceljs reads it as a number
           if (toISODate(excelDateToDate(dateCell)) === date) {
             targetRow = row;
           }
        }
      }
    });

    if (!targetRow) {
      return { ok: false, locked: false, error: `No training entry found for date ${date}.` };
    }

    // Column C is 3 (Day Type), Column D is 4 (Exercises)
    // Column F is 6 (Completed), Column G is 7 (Notes)
    const dayTypeCell = targetRow.getCell(3);
    const exercisesCell = targetRow.getCell(4);
    const completedCell = targetRow.getCell(6);
    const notesCell = targetRow.getCell(7);

    if (dayType !== undefined) {
      dayTypeCell.value = dayType;
    }
    if (exercises !== undefined) {
      exercisesCell.value = exercises;
    }

    if (completed === true) {
      completedCell.value = 'Yes';
    } else if (completed === false) {
      completedCell.value = 'No';
    } else {
      completedCell.value = null;
    }

    if (notes.trim()) {
      notesCell.value = notes.trim();
    } else {
      notesCell.value = null;
    }

    await workbook.xlsx.writeFile(filePath);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Check for Windows file lock EBUSY error
    if (msg.includes('EBUSY') || msg.includes('locked') || msg.includes('sharing violation')) {
      return {
        ok: false,
        locked: true,
        error: 'gym.xlsx is open in another application. Close it and try again.',
      };
    }
    return { ok: false, locked: false, error: msg };
  }
}
