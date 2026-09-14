import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import type { AsyncDatabase } from '@/lib/database';
import { getSchedulerDb } from '@/lib/scheduler/db';
import { ensureGymSchedulerTask, getGymReminderStatus, saveGymReminderSettings } from './reminderStore';
import type {
  GymDailyCheckIn,
  GymActivityDay,
  GymMeasurement,
  GymOsSnapshot,
  GymPersonalRecord,
  GymProfile,
  GymSession,
  GymSetLog,
  GymTemplateExercise,
  GymWeekDay,
  GymWorkoutTemplate,
} from './types';

const USER_ID = 'default-user';
const LEGACY_FILE = process.env.GYM_EXCEL_PATH || 'D:\\My_Proj\\VERA\\Data\\GYM\\gym_calendar.xlsx';
const LEGACY_MIGRATION = 'gym-excel-calendar-v1';

type TemplateSeed = Omit<GymWorkoutTemplate, 'exercises'> & {
  exercises: Array<Omit<GymTemplateExercise, 'id' | 'order'>>;
};

const PROGRAM: TemplateSeed[] = [
  {
    id: 'monday-legs', weekday: 1, name: 'Legs', shortName: 'LEG', accent: '#ffb547',
    focus: 'Quads, hamstrings, calves and lower abs',
    exercises: [
      { name: 'Barbell Squat', muscleGroup: 'Quads', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: '45 Degree Leg Press', muscleGroup: 'Quads', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: 'Romanian Deadlift', muscleGroup: 'Hamstrings', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: 'Leg Curl', muscleGroup: 'Hamstrings', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 90 },
      { name: 'Standing Calf Raise', muscleGroup: 'Calves', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Hanging Leg Raise', muscleGroup: 'Lower abs', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 60 },
      { name: 'Plank', muscleGroup: 'Core', targetSets: 3, minReps: 30, maxReps: 60, restSeconds: 60 },
    ],
  },
  {
    id: 'tuesday-chest-a', weekday: 2, name: 'Chest A', shortName: 'CHA', accent: '#a8cf45',
    focus: 'Upper chest shelf and triceps',
    exercises: [
      { name: 'Smith Incline Press', muscleGroup: 'Upper chest', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: 'Super Incline Machine Press', muscleGroup: 'Upper chest', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: 'Cable Low to High', muscleGroup: 'Upper chest', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Skull Crusher', muscleGroup: 'Triceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 90 },
      { name: 'Overhead Cable Extension', muscleGroup: 'Triceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Rope Pushdown', muscleGroup: 'Triceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
    ],
  },
  {
    id: 'wednesday-back-width', weekday: 3, name: 'Back Width', shortName: 'BAW', accent: '#6fc6ff',
    focus: 'Lat width, rear delts and biceps',
    exercises: [
      { name: 'Wide Grip Lat Pulldown', muscleGroup: 'Lats', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 120 },
      { name: 'Straight Arm Cable Pulldown', muscleGroup: 'Lats', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Single Arm Iso Lateral Pulldown', muscleGroup: 'Lats', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 90 },
      { name: 'Reverse Pec Fly', muscleGroup: 'Rear delts', targetSets: 3, minReps: 12, maxReps: 20, restSeconds: 60 },
      { name: 'Incline DB Curl', muscleGroup: 'Biceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Bayesian Curl', muscleGroup: 'Biceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Hammer Curl', muscleGroup: 'Biceps and forearms', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
    ],
  },
  {
    id: 'thursday-shoulders', weekday: 4, name: 'Shoulders', shortName: 'SHO', accent: '#c58cff',
    focus: 'Capped delts, rear delts and lower abs',
    exercises: [
      { name: 'Shoulder Press Machine', muscleGroup: 'Delts', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 120 },
      { name: 'Cable Lateral Raise', muscleGroup: 'Side delts', targetSets: 3, minReps: 12, maxReps: 20, restSeconds: 60 },
      { name: 'Reverse Pec Fly', muscleGroup: 'Rear delts', targetSets: 3, minReps: 12, maxReps: 20, restSeconds: 60 },
      { name: 'DB Lateral Raise Burnout', muscleGroup: 'Side delts', targetSets: 3, minReps: 12, maxReps: 20, restSeconds: 60 },
      { name: 'Hanging Leg Raise', muscleGroup: 'Lower abs', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 60 },
      { name: 'Plank', muscleGroup: 'Core', targetSets: 3, minReps: 30, maxReps: 60, restSeconds: 60 },
    ],
  },
  {
    id: 'friday-chest-b', weekday: 5, name: 'Chest B', shortName: 'CHB', accent: '#a8cf45',
    focus: 'Upper chest volume and triceps',
    exercises: [
      { name: 'Incline DB Press', muscleGroup: 'Upper chest', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: 'Smith Incline Press', muscleGroup: 'Upper chest', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 150 },
      { name: 'Cable Low to High', muscleGroup: 'Upper chest', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'High Cable Crossover', muscleGroup: 'Chest', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Close Grip Smith Press', muscleGroup: 'Triceps', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 120 },
      { name: 'Overhead Cable Extension', muscleGroup: 'Triceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Rope Pushdown', muscleGroup: 'Triceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
    ],
  },
  {
    id: 'saturday-back-thickness', weekday: 6, name: 'Back Thickness', shortName: 'BAT', accent: '#6fc6ff',
    focus: 'Back density, rear delts, biceps and forearms',
    exercises: [
      { name: 'Neutral Grip Lat Pulldown', muscleGroup: 'Lats', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 120 },
      { name: 'Seated Cable Row', muscleGroup: 'Mid back', targetSets: 4, minReps: 6, maxReps: 10, restSeconds: 120 },
      { name: 'Close Grip Pulldown', muscleGroup: 'Lats', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 90 },
      { name: 'Reverse Pec Fly', muscleGroup: 'Rear delts', targetSets: 3, minReps: 12, maxReps: 20, restSeconds: 60 },
      { name: 'Preacher Curl', muscleGroup: 'Biceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Incline DB Curl', muscleGroup: 'Biceps', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
      { name: 'Hammer Curl', muscleGroup: 'Biceps and forearms', targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 75 },
    ],
  },
  {
    id: 'sunday-rest', weekday: 0, name: 'Rest', shortName: 'RST', accent: '#737a68',
    focus: 'Recovery, mobility and weekly measurements', exercises: [],
  },
];

let initialization: Promise<void> | null = null;

async function db() {
  const database = await getSchedulerDb();
  initialization ??= initialize(database);
  await initialization;
  return database;
}

async function ensureGymColumn(
  database: AsyncDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const columns = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!columns.some((item) => item.name === column)) {
    await database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initialize(database: AsyncDatabase) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS gym_profiles (
      user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      sex TEXT NOT NULL,
      height_cm REAL NOT NULL,
      current_weight_kg REAL NOT NULL,
      target_weight_kg REAL NOT NULL,
      current_body_fat_pct REAL NOT NULL,
      target_body_fat_pct REAL NOT NULL,
      target_date TEXT NOT NULL,
      calorie_target INTEGER NOT NULL,
      protein_target_g INTEGER NOT NULL,
      carbs_target_g INTEGER NOT NULL,
      fat_target_g INTEGER NOT NULL,
      water_target_l REAL NOT NULL,
      steps_target INTEGER NOT NULL,
      training_start_time TEXT NOT NULL,
      session_minutes INTEGER NOT NULL,
      timezone TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gym_workout_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      focus TEXT NOT NULL,
      accent TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS gym_template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES gym_workout_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      exercise_order INTEGER NOT NULL,
      target_sets INTEGER NOT NULL CHECK (target_sets BETWEEN 1 AND 10),
      min_reps INTEGER NOT NULL CHECK (min_reps BETWEEN 1 AND 120),
      max_reps INTEGER NOT NULL CHECK (max_reps BETWEEN 1 AND 120),
      rest_seconds INTEGER NOT NULL CHECK (rest_seconds BETWEEN 15 AND 600)
    );

    CREATE TABLE IF NOT EXISTS gym_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_date TEXT NOT NULL,
      template_id TEXT REFERENCES gym_workout_templates(id),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','skipped')),
      started_at TEXT,
      completed_at TEXT,
      duration_minutes INTEGER,
      pre_pain INTEGER CHECK (pre_pain BETWEEN 0 AND 10),
      post_pain INTEGER CHECK (post_pain BETWEEN 0 AND 10),
      energy INTEGER CHECK (energy BETWEEN 1 AND 5),
      post_fatigue INTEGER CHECK (post_fatigue BETWEEN 1 AND 5),
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, session_date)
    );

    CREATE TABLE IF NOT EXISTS gym_set_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
      template_exercise_id TEXT REFERENCES gym_template_exercises(id),
      exercise_name TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight_kg REAL NOT NULL CHECK (weight_kg >= 0),
      reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 120),
      rir INTEGER NOT NULL CHECK (rir BETWEEN 0 AND 10),
      pain INTEGER NOT NULL CHECK (pain BETWEEN 0 AND 10),
      warmup INTEGER NOT NULL DEFAULT 0 CHECK (warmup IN (0, 1)),
      notes TEXT NOT NULL DEFAULT '',
      logged_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gym_daily_checkins (
      user_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL,
      weight_kg REAL,
      calories INTEGER,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      water_l REAL,
      steps INTEGER,
      sleep_hours REAL,
      mood INTEGER CHECK (mood BETWEEN 1 AND 5),
      fatigue INTEGER CHECK (fatigue BETWEEN 1 AND 5),
      pain INTEGER CHECK (pain BETWEEN 0 AND 10),
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, checkin_date)
    );

    CREATE TABLE IF NOT EXISTS gym_measurements (
      user_id TEXT NOT NULL,
      measurement_date TEXT NOT NULL,
      weight_kg REAL,
      body_fat_pct REAL,
      waist_cm REAL,
      chest_cm REAL,
      shoulders_cm REAL,
      left_bicep_cm REAL,
      right_bicep_cm REAL,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, measurement_date)
    );

    CREATE TABLE IF NOT EXISTS gym_progress_photos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      photo_date TEXT NOT NULL,
      view TEXT NOT NULL CHECK (view IN ('front','side','back')),
      local_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gym_legacy_days (
      user_id TEXT NOT NULL,
      training_date TEXT NOT NULL,
      weekday TEXT NOT NULL,
      day_type TEXT NOT NULL,
      exercises_json TEXT NOT NULL,
      muscle_focus TEXT NOT NULL,
      completed INTEGER,
      notes TEXT NOT NULL,
      PRIMARY KEY(user_id, training_date)
    );

    CREATE TABLE IF NOT EXISTS gym_migrations (
      migration_key TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      imported_rows INTEGER NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gym_schedule_overrides (
      user_id TEXT NOT NULL,
      schedule_date TEXT NOT NULL,
      template_id TEXT NOT NULL REFERENCES gym_workout_templates(id),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, schedule_date)
    );

    CREATE INDEX IF NOT EXISTS idx_gym_sessions_user_date ON gym_sessions(user_id, session_date);
    CREATE INDEX IF NOT EXISTS idx_gym_sets_session_exercise ON gym_set_logs(session_id, exercise_name, set_number);
    CREATE INDEX IF NOT EXISTS idx_gym_checkins_user_date ON gym_daily_checkins(user_id, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_gym_measurements_user_date ON gym_measurements(user_id, measurement_date);
  `);

  // An exceptional session can use a different hour without changing the normal profile schedule.
  await ensureGymColumn(database, 'gym_schedule_overrides', 'training_start_time', 'TEXT');
  await ensureGymColumn(database, 'gym_schedule_overrides', 'session_minutes', 'INTEGER');

  const now = new Date().toISOString();
  await database.prepare(`
    INSERT OR IGNORE INTO gym_profiles (
      user_id,name,age,sex,height_cm,current_weight_kg,target_weight_kg,current_body_fat_pct,
      target_body_fat_pct,target_date,calorie_target,protein_target_g,carbs_target_g,fat_target_g,
      water_target_l,steps_target,training_start_time,session_minutes,timezone,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(USER_ID, 'Soumya', 25, 'Male', 181, 79, 75, 19, 12.5, '2026-11-30', 2180, 165, 195, 50, 3.5, 8000, '21:00', 90, 'Asia/Kolkata', now);

  const templateCount = await database.prepare('SELECT COUNT(*) AS count FROM gym_workout_templates WHERE user_id=?').get<{ count: number }>(USER_ID) as { count: number };
  if (templateCount.count === 0) {
    const insertTemplate = database.prepare('INSERT INTO gym_workout_templates(id,user_id,weekday,name,short_name,focus,accent) VALUES(?,?,?,?,?,?,?)');
    const insertExercise = database.prepare(`INSERT INTO gym_template_exercises(id,template_id,name,muscle_group,exercise_order,target_sets,min_reps,max_reps,rest_seconds) VALUES(?,?,?,?,?,?,?,?,?)`);
    await database.transaction(async (transaction) => {
      const insertTemplate = transaction.prepare('INSERT INTO gym_workout_templates(id,user_id,weekday,name,short_name,focus,accent) VALUES(?,?,?,?,?,?,?)');
      const insertExercise = transaction.prepare(`INSERT INTO gym_template_exercises(id,template_id,name,muscle_group,exercise_order,target_sets,min_reps,max_reps,rest_seconds) VALUES(?,?,?,?,?,?,?,?,?)`);
      for (const template of PROGRAM) {
        await insertTemplate.run(template.id, USER_ID, template.weekday, template.name, template.shortName, template.focus, template.accent);
        for (const [index, exercise] of template.exercises.entries()) {
          await insertExercise.run(`${template.id}-${index + 1}`, template.id, exercise.name, exercise.muscleGroup, index + 1, exercise.targetSets, exercise.minReps, exercise.maxReps, exercise.restSeconds);
        }
      }
    })();
  }

  await migrateLegacyWorkbook(database);
  // Turso's HTTP driver rejects PRAGMA optimize (400), while SQLite accepts it.
  // It is an optional maintenance hint, so keep it for local SQLite only.
  if (!process.env.TURSO_DATABASE_URL) await database.pragma('optimize');
}

function excelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  return null;
}

function splitExercises(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  if (value.includes('\n')) return value.split('\n').map((item) => item.trim()).filter(Boolean);
  return value.split(/(?=\d+\.\s)/).map((item) => item.trim()).filter(Boolean);
}

async function migrateLegacyWorkbook(database: AsyncDatabase) {
  const exists = await database.prepare('SELECT 1 FROM gym_migrations WHERE migration_key=?').get(LEGACY_MIGRATION);
  if (exists || !fs.existsSync(/* turbopackIgnore: true */ LEGACY_FILE)) return;
  const workbookBytes = fs.readFileSync(/* turbopackIgnore: true */ LEGACY_FILE);
  const workbook = XLSX.read(workbookBytes, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets['6-Month Calendar'];
  if (!sheet) return;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const insert = database.prepare(`
    INSERT OR IGNORE INTO gym_legacy_days(user_id,training_date,weekday,day_type,exercises_json,muscle_focus,completed,notes)
    VALUES(?,?,?,?,?,?,?,?)
  `);
  let imported = 0;
  await database.transaction(async (transaction) => {
    const transactionInsert = transaction.prepare(`
      INSERT OR IGNORE INTO gym_legacy_days(user_id,training_date,weekday,day_type,exercises_json,muscle_focus,completed,notes)
      VALUES(?,?,?,?,?,?,?,?)
    `);
    for (const row of rows.slice(2)) {
      const date = excelDate(row[0]);
      if (!date) continue;
      const completedRaw = String(row[5] ?? '').trim().toLowerCase();
      const completed = completedRaw === 'yes' || completedRaw === 'true' || completedRaw === '1' ? 1
        : completedRaw === 'no' || completedRaw === 'false' || completedRaw === '0' ? 0 : null;
      const result = await transactionInsert.run(
        USER_ID,
        date,
        String(row[1] ?? ''),
        String(row[2] ?? 'Rest'),
        JSON.stringify(splitExercises(row[3])),
        String(row[4] ?? ''),
        completed,
        String(row[6] ?? ''),
      );
      imported += result.changes;
    }
    await transaction.prepare('INSERT INTO gym_migrations(migration_key,source_path,imported_rows,imported_at) VALUES(?,?,?,?)')
      .run(LEGACY_MIGRATION, LEGACY_FILE, imported, new Date().toISOString());
  })();
}

function mapProfile(row: Record<string, unknown>): GymProfile {
  return {
    userId: String(row.user_id), name: String(row.name), age: Number(row.age), sex: String(row.sex),
    heightCm: Number(row.height_cm), currentWeightKg: Number(row.current_weight_kg), targetWeightKg: Number(row.target_weight_kg),
    currentBodyFatPct: Number(row.current_body_fat_pct), targetBodyFatPct: Number(row.target_body_fat_pct), targetDate: String(row.target_date),
    calorieTarget: Number(row.calorie_target), proteinTargetG: Number(row.protein_target_g), carbsTargetG: Number(row.carbs_target_g),
    fatTargetG: Number(row.fat_target_g), waterTargetL: Number(row.water_target_l), stepsTarget: Number(row.steps_target),
    trainingStartTime: String(row.training_start_time), sessionMinutes: Number(row.session_minutes), timezone: String(row.timezone),
  };
}

async function templates(database: AsyncDatabase): Promise<GymWorkoutTemplate[]> {
  const rows = await database.prepare('SELECT * FROM gym_workout_templates WHERE user_id=? AND active=1 ORDER BY weekday').all<Record<string, unknown>>(USER_ID);
  const exerciseRows = await database.prepare('SELECT * FROM gym_template_exercises ORDER BY template_id,exercise_order').all<Record<string, unknown>>();
  return rows.map((row) => ({
    id: String(row.id), weekday: Number(row.weekday), name: String(row.name), shortName: String(row.short_name),
    focus: String(row.focus), accent: String(row.accent),
    exercises: exerciseRows.filter((item) => item.template_id === row.id).map((item) => ({
      id: String(item.id), name: String(item.name), muscleGroup: String(item.muscle_group), order: Number(item.exercise_order),
      targetSets: Number(item.target_sets), minReps: Number(item.min_reps), maxReps: Number(item.max_reps), restSeconds: Number(item.rest_seconds),
    })),
  }));
}

function mapSet(row: Record<string, unknown>): GymSetLog {
  const weight = Number(row.weight_kg);
  const reps = Number(row.reps);
  return {
    id: String(row.id), exerciseId: row.template_exercise_id ? String(row.template_exercise_id) : null,
    exerciseName: String(row.exercise_name), setNumber: Number(row.set_number), weightKg: weight, reps,
    rir: Number(row.rir), pain: Number(row.pain), warmup: Boolean(row.warmup), notes: String(row.notes), loggedAt: String(row.logged_at),
    volumeKg: weight * reps, estimatedOneRepMax: weight > 0 ? weight * (1 + reps / 30) : 0,
  };
}

async function sessionForDate(database: AsyncDatabase, date: string): Promise<GymSession | null> {
  const row = await database.prepare('SELECT * FROM gym_sessions WHERE user_id=? AND session_date=?').get<Record<string, unknown>>(USER_ID, date);
  if (!row) return null;
  const sets = await database.prepare('SELECT * FROM gym_set_logs WHERE session_id=? ORDER BY logged_at,set_number').all<Record<string, unknown>>(row.id);
  return {
    id: String(row.id), date: String(row.session_date), templateId: row.template_id ? String(row.template_id) : null,
    name: String(row.name), status: row.status as GymSession['status'], startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null, durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    prePain: row.pre_pain == null ? null : Number(row.pre_pain), postPain: row.post_pain == null ? null : Number(row.post_pain),
    energy: row.energy == null ? null : Number(row.energy), postFatigue: row.post_fatigue == null ? null : Number(row.post_fatigue),
    notes: String(row.notes), sets: sets.map(mapSet),
  };
}

function checkInFromRow(row: Record<string, unknown> | undefined): GymDailyCheckIn | null {
  if (!row) return null;
  const n = (key: string) => row[key] == null ? null : Number(row[key]);
  return {
    date: String(row.checkin_date), weightKg: n('weight_kg'), calories: n('calories'), proteinG: n('protein_g'),
    carbsG: n('carbs_g'), fatG: n('fat_g'), waterL: n('water_l'), steps: n('steps'), sleepHours: n('sleep_hours'),
    mood: n('mood'), fatigue: n('fatigue'), pain: n('pain'), notes: String(row.notes),
  };
}

function measurementFromRow(row: Record<string, unknown>): GymMeasurement {
  const n = (key: string) => row[key] == null ? null : Number(row[key]);
  return {
    date: String(row.measurement_date), weightKg: n('weight_kg'), bodyFatPct: n('body_fat_pct'), waistCm: n('waist_cm'),
    chestCm: n('chest_cm'), shouldersCm: n('shoulders_cm'), leftBicepCm: n('left_bicep_cm'), rightBicepCm: n('right_bicep_cm'),
    notes: String(row.notes),
  };
}

function dateForOffset(date: string, offset: number): string {
  const current = new Date(`${date}T12:00:00Z`);
  current.setUTCDate(current.getUTCDate() + offset);
  return current.toISOString().slice(0, 10);
}

function mondayFor(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dateForOffset(date, -(day === 0 ? 6 : day - 1));
}

async function buildWeekSchedule(
  database: AsyncDatabase,
  plan: GymWorkoutTemplate[],
  monday: string,
  selectedDate: string,
  sessions: Array<{ session_date: string; status: GymSession['status']; template_id: string | null }>,
): Promise<GymWeekDay[]> {
  const sessionByDate = new Map(sessions.map((row) => [row.session_date, row]));
  const overrideRows = await database.prepare('SELECT schedule_date,template_id FROM gym_schedule_overrides WHERE user_id=? AND schedule_date BETWEEN ? AND ?')
    .all<{ schedule_date: string; template_id: string }>(USER_ID, monday, dateForOffset(monday, 6));
  const overrides = new Map(overrideRows.map((row) => [row.schedule_date, row.template_id]));
  const oneOffTemplateIds = [...new Set(overrideRows.map((row) => row.template_id).filter((id) => !plan.some((item) => item.id === id)))];
  const oneOffTemplates = (await Promise.all(oneOffTemplateIds.map((id) => templateById(database, id)))).filter((item): item is GymWorkoutTemplate => Boolean(item));
  const resolvablePlan = [...plan, ...oneOffTemplates];
  return Array.from({ length: 7 }, (_, index) => {
    const itemDate = dateForOffset(monday, index);
    const itemWeekday = new Date(`${itemDate}T12:00:00Z`).getUTCDay();
    const autoTemplate = plan.find((item) => item.weekday === itemWeekday) ?? plan.find((item) => item.weekday === 0)!;
    const session = sessionByDate.get(itemDate);
    const overrideTemplate = overrides.get(itemDate) ? resolvablePlan.find((item) => item.id === overrides.get(itemDate)) : undefined;
    const assigned = overrideTemplate ?? (session?.template_id ? resolvablePlan.find((item) => item.id === session.template_id) : undefined) ?? autoTemplate;
    return {
      date: itemDate,
      weekday: new Date(`${itemDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      template: assigned,
      autoTemplate,
      overrideTemplateId: overrideTemplate?.id ?? null,
      isAuto: !overrideTemplate,
      sessionStatus: session?.status ?? null,
    };
  });
}

async function templateById(database: AsyncDatabase, id: string): Promise<GymWorkoutTemplate | null> {
  const row = await database.prepare('SELECT * FROM gym_workout_templates WHERE id=? AND user_id=?').get<Record<string, unknown>>(id, USER_ID);
  if (!row) return null;
  const exercises = await database.prepare('SELECT * FROM gym_template_exercises WHERE template_id=? ORDER BY exercise_order').all<Record<string, unknown>>(id);
  return {
    id: String(row.id), weekday: Number(row.weekday), name: String(row.name), shortName: String(row.short_name),
    focus: String(row.focus), accent: String(row.accent),
    exercises: exercises.map((item) => ({
      id: String(item.id), name: String(item.name), muscleGroup: String(item.muscle_group), order: Number(item.exercise_order),
      targetSets: Number(item.target_sets), minReps: Number(item.min_reps), maxReps: Number(item.max_reps), restSeconds: Number(item.rest_seconds),
    })),
  };
}

async function records(database: AsyncDatabase): Promise<GymPersonalRecord[]> {
  const rows = await database.prepare(`
    SELECT exercise_name,weight_kg,reps,logged_at,
      (weight_kg * (1 + reps / 30.0)) AS e1rm,
      ROW_NUMBER() OVER (PARTITION BY lower(exercise_name) ORDER BY (weight_kg * (1 + reps / 30.0)) DESC, logged_at DESC) AS rank
    FROM gym_set_logs WHERE warmup=0 AND weight_kg>0
  `).all<Record<string, unknown>>();
  return rows.filter((row) => Number(row.rank) === 1).slice(0, 12).map((row) => ({
    exerciseName: String(row.exercise_name), weightKg: Number(row.weight_kg), reps: Number(row.reps),
    estimatedOneRepMax: Number(row.e1rm), date: String(row.logged_at).slice(0, 10),
  }));
}

async function activityHistory(
  database: AsyncDatabase,
  profile: GymProfile,
  endDate: string,
): Promise<GymActivityDay[]> {
  const rows = await database.prepare(`
    SELECT
      g.session_date,
      g.status,
      COALESCE(
        g.duration_minutes,
        CASE WHEN g.started_at IS NOT NULL AND g.completed_at IS NOT NULL
          THEN ROUND((julianday(g.completed_at) - julianday(g.started_at)) * 1440)
          WHEN g.status='in_progress' AND g.started_at IS NOT NULL
          THEN MIN(360, MAX(0, ROUND((julianday('now') - julianday(g.started_at)) * 1440)))
          ELSE 0 END
      ) AS duration_minutes,
      COUNT(CASE WHEN s.warmup=0 THEN 1 END) AS working_sets,
      COALESCE(SUM(CASE WHEN s.warmup=0 THEN s.reps ELSE 0 END),0) AS total_reps,
      COALESCE(SUM(CASE WHEN s.warmup=0 THEN s.weight_kg*s.reps ELSE 0 END),0) AS volume_kg,
      COALESCE((SELECT SUM(e.target_sets) FROM gym_template_exercises e WHERE e.template_id=g.template_id),0) AS target_sets
    FROM gym_sessions g
    LEFT JOIN gym_set_logs s ON s.session_id=g.id
    WHERE g.user_id=? AND g.session_date BETWEEN ? AND ?
    GROUP BY g.id
    ORDER BY g.session_date
  `).all<Record<string, unknown>>(USER_ID, dateForOffset(endDate, -370), endDate);

  return rows.map((row) => {
    const status = String(row.status) as GymSession['status'];
    const durationMinutes = Math.max(0, Number(row.duration_minutes));
    const workingSets = Number(row.working_sets);
    const totalReps = Number(row.total_reps);
    const targetSets = Number(row.target_sets);
    const completionPoints = status === 'completed' ? 35 : status === 'in_progress' ? 10 : 0;
    const durationPoints = Math.min(durationMinutes / Math.max(profile.sessionMinutes, 1), 1) * 30;
    const setPoints = Math.min(workingSets / Math.max(targetSets || 20, 1), 1) * 25;
    const repPoints = Math.min(totalReps / 250, 1) * 10;
    const score = Math.round(completionPoints + durationPoints + setPoints + repPoints);
    const hasWork = status === 'completed' || status === 'in_progress' || workingSets > 0 || durationMinutes > 0;
    const level: GymActivityDay['level'] = !hasWork ? 0 : score >= 80 ? 4 : score >= 60 ? 3 : score >= 35 ? 2 : 1;
    return {
      date: String(row.session_date), status, durationMinutes, workingSets, totalReps,
      volumeKg: Math.round(Number(row.volume_kg)), score, level,
    };
  });
}

export async function getGymOsSnapshot(date: string): Promise<GymOsSnapshot> {
  const database = await db();
  const defaultProfile = mapProfile(await database.prepare('SELECT * FROM gym_profiles WHERE user_id=?').get<Record<string, unknown>>(USER_ID) as Record<string, unknown>);
  const timingOverride = await database.prepare('SELECT training_start_time,session_minutes FROM gym_schedule_overrides WHERE user_id=? AND schedule_date=?')
    .get<{ training_start_time: string | null; session_minutes: number | null }>(USER_ID, date);
  const profile: GymProfile = {
    ...defaultProfile,
    trainingStartTime: timingOverride?.training_start_time ?? defaultProfile.trainingStartTime,
    sessionMinutes: timingOverride?.session_minutes ?? defaultProfile.sessionMinutes,
  };
  const plan = await templates(database);
  const monday = mondayFor(date);
  const sessionRows = await database.prepare('SELECT session_date,status,template_id FROM gym_sessions WHERE user_id=? AND session_date BETWEEN ? AND ?').all<{ session_date: string; status: GymSession['status']; template_id: string | null }>(USER_ID, monday, dateForOffset(monday, 6));
  const week = await buildWeekSchedule(database, plan, monday, date, sessionRows);
  const todayTemplate = week.find((item) => item.date === date)?.template ?? plan.find((item) => item.weekday === 0)!;
  const checkInRow = await database.prepare('SELECT * FROM gym_daily_checkins WHERE user_id=? AND checkin_date=?').get<Record<string, unknown>>(USER_ID, date);
  const measurementRows = await database.prepare('SELECT * FROM gym_measurements WHERE user_id=? ORDER BY measurement_date DESC LIMIT 12').all<Record<string, unknown>>(USER_ID);
  const weightRows = await database.prepare('SELECT checkin_date AS date,weight_kg AS value FROM gym_daily_checkins WHERE user_id=? AND weight_kg IS NOT NULL ORDER BY checkin_date DESC LIMIT 28').all<{ date: string; value: number }>(USER_ID);
  const lastSeven = weightRows.slice(0, 7);
  const totalVolume = await database.prepare(`SELECT COALESCE(SUM(s.weight_kg*s.reps),0) AS total FROM gym_set_logs s JOIN gym_sessions g ON g.id=s.session_id WHERE g.user_id=? AND g.session_date BETWEEN ? AND ? AND s.warmup=0`).get<{ total: number }>(USER_ID, monday, dateForOffset(monday, 6)) as { total: number };
  const completedThisWeek = sessionRows.filter((item) => item.status === 'completed').length;
  let streak = 0;
  const completedDates = new Set((await database.prepare("SELECT session_date FROM gym_sessions WHERE user_id=? AND status='completed' ORDER BY session_date DESC").all<{session_date:string}>(USER_ID)).map((item) => item.session_date));
  for (let cursor = date, i = 0; i < 180; i += 1, cursor = dateForOffset(cursor, -1)) {
    const day = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    if (day === 0) continue;
    if (completedDates.has(cursor)) streak += 1;
    else break;
  }
  const migration = await database.prepare('SELECT imported_rows,imported_at FROM gym_migrations WHERE migration_key=?').get<{ imported_rows: number; imported_at: string }>(LEGACY_MIGRATION);
  const photoCount = await database.prepare('SELECT COUNT(*) AS count FROM gym_progress_photos WHERE user_id=?').get<{ count: number }>(USER_ID) as { count: number };
  const todaySession = await sessionForDate(database, date);
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: profile.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (date >= currentDate && todayTemplate.weekday !== 0) {
    await ensureGymSchedulerTask({ date, profile, template: todayTemplate, session: todaySession });
  }
  return {
    date, profile, todayTemplate, todaySession, todayCheckIn: checkInFromRow(checkInRow), templates: plan, week,
    measurements: measurementRows.map(measurementFromRow), personalRecords: await records(database), activity: await activityHistory(database, profile, date),
    trends: {
      weight: weightRows.reverse(), weeklyAverageWeight: lastSeven.length ? lastSeven.reduce((sum, item) => sum + Number(item.value), 0) / lastSeven.length : null,
      totalVolumeKg: Number(totalVolume.total), completedThisWeek, plannedThisWeek: 6, streak,
    },
    migration: { importedDays: migration?.imported_rows ?? 0, importedAt: migration?.imported_at ?? null },
    progressPhotoCount: photoCount.count,
    reminders: await getGymReminderStatus(date, profile),
  };
}

function requiredDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A valid date is required.');
  return value;
}

function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Enter a number between ${min} and ${max}.`);
  return number;
}

async function ensureSession(database: AsyncDatabase, date: string, templateId?: string, prePain?: number | null): Promise<string> {
  const plan = await templates(database);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const template = (templateId ? await templateById(database, templateId) : null) ?? plan.find((item) => item.weekday === weekday) ?? plan.find((item) => item.weekday === 0)!;
  const existing = await database.prepare('SELECT id FROM gym_sessions WHERE user_id=? AND session_date=?').get<{ id: string }>(USER_ID, date);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO gym_sessions(id,user_id,session_date,template_id,name,status,started_at,pre_pain,updated_at) VALUES(?,?,?,?,?,'in_progress',?,?,?)`)
    .run(id, USER_ID, date, template.id, template.name, now, prePain ?? null, now);
  return id;
}

export async function applyGymAction(body: Record<string, unknown>): Promise<GymOsSnapshot> {
  const database = await db();
  const action = String(body.action ?? '');
  const date = requiredDate(body.date);
  const now = new Date().toISOString();

  if (action === 'swap_schedule') {
    const firstDate = requiredDate(body.firstDate);
    const secondDate = requiredDate(body.secondDate);
    const firstTemplateId = String(body.firstTemplateId ?? '');
    const secondTemplateId = String(body.secondTemplateId ?? '');
    if (firstDate === secondDate) throw new Error('Choose two different days to swap.');
    const available = new Set((await templates(database)).map((item) => item.id));
    if (!available.has(firstTemplateId) || !available.has(secondTemplateId)) throw new Error('Choose valid workout cards to swap.');
    const swap = database.transaction(async (transaction) => {
      await transaction.prepare(`
        INSERT INTO gym_schedule_overrides(user_id,schedule_date,template_id,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id,schedule_date) DO UPDATE SET template_id=excluded.template_id,updated_at=excluded.updated_at
      `).run(USER_ID, firstDate, secondTemplateId, now);
      await transaction.prepare(`
        INSERT INTO gym_schedule_overrides(user_id,schedule_date,template_id,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id,schedule_date) DO UPDATE SET template_id=excluded.template_id,updated_at=excluded.updated_at
      `).run(USER_ID, secondDate, firstTemplateId, now);
    });
    await swap();
  } else if (action === 'save_schedule') {
    const assignments = body.assignments;
    if (!Array.isArray(assignments)) throw new Error('Schedule assignments are required.');
    const available = new Set((await templates(database)).map((item) => item.id));
    const save = database.transaction(async (transaction) => {
      for (const item of assignments.slice(0, 7)) {
        const assignment = item as Record<string, unknown>;
        const scheduleDate = requiredDate(assignment.date);
        const templateId = assignment.templateId == null || assignment.templateId === '' ? null : String(assignment.templateId);
        if (templateId && !available.has(templateId)) throw new Error('Choose a valid workout for every schedule day.');
        if (!templateId) {
          await transaction.prepare('DELETE FROM gym_schedule_overrides WHERE user_id=? AND schedule_date=?').run(USER_ID, scheduleDate);
        } else {
          await transaction.prepare(`
            INSERT INTO gym_schedule_overrides(user_id,schedule_date,template_id,updated_at) VALUES(?,?,?,?)
            ON CONFLICT(user_id,schedule_date) DO UPDATE SET template_id=excluded.template_id,updated_at=excluded.updated_at
          `).run(USER_ID, scheduleDate, templateId, now);
        }
      }
    });
    await save();
  } else if (action === 'save_one_day_plan') {
    const name = String(body.name ?? '').trim().slice(0, 100);
    const focus = String(body.focus ?? '').trim().slice(0, 300);
    const startTime = String(body.trainingStartTime ?? '');
    const duration = optionalNumber(body.sessionMinutes, 15, 360);
    if (!name || !focus) throw new Error('The one-day workout needs a name and muscle focus.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error('Training time must use HH:MM.');
    if (duration == null || !Array.isArray(body.exercises) || body.exercises.length === 0) throw new Error('Add the duration and exercises for this workout.');
    const exercises = body.exercises.slice(0, 20).map((item, index) => {
      const value = item as Record<string, unknown>;
      const exerciseName = String(value.name ?? '').trim().slice(0, 100);
      if (!exerciseName) throw new Error('Every exercise needs a name.');
      const minReps = optionalNumber(value.minReps, 1, 120);
      const maxReps = optionalNumber(value.maxReps, minReps ?? 1, 120);
      const targetSets = optionalNumber(value.targetSets, 1, 10);
      if (minReps == null || maxReps == null || targetSets == null) throw new Error('Every exercise needs valid sets and reps.');
      return {
        id: `oneoff-${date}-${index + 1}`,
        name: exerciseName,
        muscleGroup: String(value.muscleGroup ?? '').trim().slice(0, 80) || 'General',
        targetSets, minReps, maxReps,
        restSeconds: optionalNumber(value.restSeconds, 15, 600) ?? 75,
      };
    });
    const templateId = `oneoff-${date}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    await database.transaction(async (transaction) => {
      await transaction.prepare(`
        INSERT INTO gym_workout_templates(id,user_id,weekday,name,short_name,focus,accent,active) VALUES(?,?,?,?,?,?,?,0)
        ON CONFLICT(id) DO UPDATE SET weekday=excluded.weekday,name=excluded.name,short_name=excluded.short_name,focus=excluded.focus,accent=excluded.accent,active=0
      `).run(templateId, USER_ID, weekday, name, 'BACK', focus, '#6fc6ff');
      await transaction.prepare('UPDATE gym_set_logs SET template_exercise_id=NULL WHERE template_exercise_id IN (SELECT id FROM gym_template_exercises WHERE template_id=?)').run(templateId);
      await transaction.prepare('DELETE FROM gym_template_exercises WHERE template_id=?').run(templateId);
      const insert = transaction.prepare('INSERT INTO gym_template_exercises(id,template_id,name,muscle_group,exercise_order,target_sets,min_reps,max_reps,rest_seconds) VALUES(?,?,?,?,?,?,?,?,?)');
      for (const [index, exercise] of exercises.entries()) await insert.run(exercise.id, templateId, exercise.name, exercise.muscleGroup, index + 1, exercise.targetSets, exercise.minReps, exercise.maxReps, exercise.restSeconds);
      await transaction.prepare(`
        INSERT INTO gym_schedule_overrides(user_id,schedule_date,template_id,training_start_time,session_minutes,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(user_id,schedule_date) DO UPDATE SET template_id=excluded.template_id,training_start_time=excluded.training_start_time,session_minutes=excluded.session_minutes,updated_at=excluded.updated_at
      `).run(USER_ID, date, templateId, startTime, duration, now);
      await transaction.prepare('DELETE FROM gym_reminder_deliveries WHERE user_id=? AND workout_date=?').run(USER_ID, date);
    })();
  } else if (action === 'save_profile') {
    const targetDate = requiredDate(body.targetDate);
    const values = {
      currentWeight: optionalNumber(body.currentWeightKg, 30, 300),
      targetWeight: optionalNumber(body.targetWeightKg, 30, 300),
      currentBodyFat: optionalNumber(body.currentBodyFatPct, 1, 70),
      targetBodyFat: optionalNumber(body.targetBodyFatPct, 1, 70),
      calories: optionalNumber(body.calorieTarget, 800, 10000),
      protein: optionalNumber(body.proteinTargetG, 0, 500),
      carbs: optionalNumber(body.carbsTargetG, 0, 1000),
      fat: optionalNumber(body.fatTargetG, 0, 500),
      water: optionalNumber(body.waterTargetL, 0, 15),
      steps: optionalNumber(body.stepsTarget, 0, 100000),
      sessionMinutes: optionalNumber(body.sessionMinutes, 15, 360),
    };
    if (Object.values(values).some((value) => value == null)) throw new Error('Complete every goal field.');
    const startTime = String(body.trainingStartTime ?? '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error('Training time must use HH:MM.');
    await database.prepare(`UPDATE gym_profiles SET current_weight_kg=?,target_weight_kg=?,current_body_fat_pct=?,target_body_fat_pct=?,target_date=?,
      calorie_target=?,protein_target_g=?,carbs_target_g=?,fat_target_g=?,water_target_l=?,steps_target=?,training_start_time=?,session_minutes=?,updated_at=? WHERE user_id=?`)
      .run(values.currentWeight, values.targetWeight, values.currentBodyFat, values.targetBodyFat, targetDate, values.calories, values.protein,
        values.carbs, values.fat, values.water, values.steps, startTime, values.sessionMinutes, now, USER_ID);
  } else if (action === 'start_session') {
    const prePain = optionalNumber(body.prePain, 0, 10);
    await ensureSession(database, date, typeof body.templateId === 'string' ? body.templateId : undefined, prePain);
    await database.prepare("UPDATE gym_sessions SET status='in_progress',started_at=COALESCE(started_at,?),pre_pain=COALESCE(?,pre_pain),updated_at=? WHERE user_id=? AND session_date=?")
      .run(now, prePain, now, USER_ID, date);
  } else if (action === 'log_set') {
    const exerciseId = typeof body.exerciseId === 'string' ? body.exerciseId : null;
    const exercise = exerciseId ? await database.prepare('SELECT name,template_id FROM gym_template_exercises WHERE id=?').get<{ name: string; template_id: string }>(exerciseId) : undefined;
    const exerciseName = exercise?.name ?? (typeof body.exerciseName === 'string' ? body.exerciseName.trim() : '');
    if (!exerciseName) throw new Error('Choose an exercise.');
    const sessionId = await ensureSession(database, date, exercise?.template_id);
    const weight = optionalNumber(body.weightKg, 0, 1000);
    const reps = optionalNumber(body.reps, 1, 120);
    const rir = optionalNumber(body.rir, 0, 10);
    const pain = optionalNumber(body.pain, 0, 10);
    if (weight == null || reps == null || rir == null || pain == null) throw new Error('Weight, reps, RIR and pain are required.');
    const next = await database.prepare('SELECT COALESCE(MAX(set_number),0)+1 AS next FROM gym_set_logs WHERE session_id=? AND lower(exercise_name)=lower(?)').get<{ next: number }>(sessionId, exerciseName) as { next: number };
    await database.prepare(`INSERT INTO gym_set_logs(id,session_id,template_exercise_id,exercise_name,set_number,weight_kg,reps,rir,pain,warmup,notes,logged_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(), sessionId, exerciseId, exerciseName, next.next, weight, reps, rir, pain, body.warmup ? 1 : 0, String(body.notes ?? '').slice(0, 500), now);
  } else if (action === 'delete_set') {
    if (typeof body.setId !== 'string') throw new Error('Set ID is required.');
    await database.prepare('DELETE FROM gym_set_logs WHERE id=? AND session_id IN (SELECT id FROM gym_sessions WHERE user_id=?)').run(body.setId, USER_ID);
  } else if (action === 'finish_session') {
    const sessionId = await ensureSession(database, date);
    const duration = optionalNumber(body.durationMinutes, 1, 360);
    const postPain = optionalNumber(body.postPain, 0, 10);
    const postFatigue = optionalNumber(body.postFatigue, 1, 5);
    await database.prepare(`UPDATE gym_sessions SET status='completed',completed_at=?,duration_minutes=?,post_pain=?,post_fatigue=?,notes=?,updated_at=? WHERE id=?`)
      .run(now, duration, postPain, postFatigue, String(body.notes ?? '').slice(0, 2000), now, sessionId);
  } else if (action === 'save_checkin') {
    const values = {
      weight: optionalNumber(body.weightKg, 30, 300), calories: optionalNumber(body.calories, 0, 10000), protein: optionalNumber(body.proteinG, 0, 500),
      carbs: optionalNumber(body.carbsG, 0, 1000), fat: optionalNumber(body.fatG, 0, 500), water: optionalNumber(body.waterL, 0, 15),
      steps: optionalNumber(body.steps, 0, 100000), sleep: optionalNumber(body.sleepHours, 0, 24), mood: optionalNumber(body.mood, 1, 5),
      fatigue: optionalNumber(body.fatigue, 1, 5), pain: optionalNumber(body.pain, 0, 10),
    };
    await database.prepare(`
      INSERT INTO gym_daily_checkins(user_id,checkin_date,weight_kg,calories,protein_g,carbs_g,fat_g,water_l,steps,sleep_hours,mood,fatigue,pain,notes,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,checkin_date) DO UPDATE SET weight_kg=excluded.weight_kg,calories=excluded.calories,protein_g=excluded.protein_g,
      carbs_g=excluded.carbs_g,fat_g=excluded.fat_g,water_l=excluded.water_l,steps=excluded.steps,sleep_hours=excluded.sleep_hours,
      mood=excluded.mood,fatigue=excluded.fatigue,pain=excluded.pain,notes=excluded.notes,updated_at=excluded.updated_at
    `).run(USER_ID, date, values.weight, values.calories, values.protein, values.carbs, values.fat, values.water, values.steps, values.sleep, values.mood, values.fatigue, values.pain, String(body.notes ?? '').slice(0, 1000), now);
  } else if (action === 'save_measurement') {
    const fields = ['weightKg','bodyFatPct','waistCm','chestCm','shouldersCm','leftBicepCm','rightBicepCm'] as const;
    const values = fields.map((field) => optionalNumber(body[field], 0, field === 'weightKg' ? 300 : 300));
    await database.prepare(`
      INSERT INTO gym_measurements(user_id,measurement_date,weight_kg,body_fat_pct,waist_cm,chest_cm,shoulders_cm,left_bicep_cm,right_bicep_cm,notes,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,measurement_date) DO UPDATE SET weight_kg=excluded.weight_kg,body_fat_pct=excluded.body_fat_pct,waist_cm=excluded.waist_cm,
      chest_cm=excluded.chest_cm,shoulders_cm=excluded.shoulders_cm,left_bicep_cm=excluded.left_bicep_cm,right_bicep_cm=excluded.right_bicep_cm,
      notes=excluded.notes,updated_at=excluded.updated_at
    `).run(USER_ID, date, ...values, String(body.notes ?? '').slice(0, 1000), now);
  } else if (action === 'save_gym_reminders') {
    await saveGymReminderSettings({ enabled: Boolean(body.enabled), recipientEmail: String(body.recipientEmail ?? '') });
  } else if (action === 'save_template') {
    if (typeof body.templateId !== 'string' || !Array.isArray(body.exercises)) throw new Error('Template and exercises are required.');
    const exists = await database.prepare('SELECT 1 FROM gym_workout_templates WHERE id=? AND user_id=?').get(body.templateId, USER_ID);
    if (!exists) throw new Error('Workout template not found.');
    const exercises = body.exercises.slice(0, 20).map((item, index) => {
      const value = item as Record<string, unknown>;
      const name = String(value.name ?? '').trim().slice(0, 100);
      if (!name) throw new Error('Every exercise needs a name.');
      const targetSets = optionalNumber(value.targetSets, 1, 10)!;
      const minReps = optionalNumber(value.minReps, 1, 120)!;
      const maxReps = optionalNumber(value.maxReps, minReps, 120)!;
      return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name, muscleGroup: String(value.muscleGroup ?? '').trim().slice(0, 80) || 'General', targetSets, minReps, maxReps, restSeconds: optionalNumber(value.restSeconds, 15, 600) ?? 90, order: index + 1 };
    });
    await database.transaction(async (transaction) => {
      await transaction.prepare('UPDATE gym_set_logs SET template_exercise_id=NULL WHERE template_exercise_id IN (SELECT id FROM gym_template_exercises WHERE template_id=?)').run(body.templateId);
      await transaction.prepare('DELETE FROM gym_template_exercises WHERE template_id=?').run(body.templateId);
      const insert = transaction.prepare('INSERT INTO gym_template_exercises(id,template_id,name,muscle_group,exercise_order,target_sets,min_reps,max_reps,rest_seconds) VALUES(?,?,?,?,?,?,?,?,?)');
      for (const exercise of exercises) await insert.run(exercise.id, body.templateId, exercise.name, exercise.muscleGroup, exercise.order, exercise.targetSets, exercise.minReps, exercise.maxReps, exercise.restSeconds);
    })();
  } else {
    throw new Error('Unknown gym action.');
  }
  return await getGymOsSnapshot(date);
}

export async function recordProgressPhoto(input: { date: string; view: string; localPath: string; originalName: string }) {
  const database = await db();
  requiredDate(input.date);
  if (!['front', 'side', 'back'].includes(input.view)) throw new Error('Photo view must be front, side or back.');
  await database.prepare('INSERT INTO gym_progress_photos(id,user_id,photo_date,view,local_path,original_name,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), USER_ID, input.date, input.view, input.localPath, input.originalName.slice(0, 200), new Date().toISOString());
}

export async function getLegacyGymDays() {
  const database = await db();
  return (await database.prepare('SELECT * FROM gym_legacy_days WHERE user_id=? ORDER BY training_date').all<Record<string, unknown>>(USER_ID)).map((row) => ({
    date: String(row.training_date), weekday: String(row.weekday), dayType: String(row.day_type),
    exercises: JSON.parse(String(row.exercises_json)) as string[], muscleFocus: String(row.muscle_focus),
    completed: row.completed == null ? null : Boolean(row.completed), notes: String(row.notes),
  }));
}

export async function updateLegacyGymDay(input: { date: string; completed: boolean | null; notes: string; dayType?: string; exercises?: string }) {
  const database = await db();
  const existing = await database.prepare('SELECT 1 FROM gym_legacy_days WHERE user_id=? AND training_date=?').get(USER_ID, input.date);
  if (!existing) return false;
  await database.prepare(`UPDATE gym_legacy_days SET completed=?,notes=?,day_type=COALESCE(?,day_type),exercises_json=COALESCE(?,exercises_json) WHERE user_id=? AND training_date=?`)
    .run(input.completed == null ? null : input.completed ? 1 : 0, input.notes.trim(), input.dayType ?? null, input.exercises == null ? null : JSON.stringify(splitExercises(input.exercises)), USER_ID, input.date);
  return true;
}

export function gymPhotoDirectory() {
  const directory = path.join(process.cwd(), 'data', 'gym-photos');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
