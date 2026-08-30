import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PERSONALITY_MODES } from './personalities';
import type {
  CreateTaskInput,
  PersonalityMode,
  SchedulerSettings,
  SchedulerSnapshot,
  SchedulerTask,
  UpdateTaskInput,
} from './types';

const DEFAULT_USER_ID = 'default-user';
const DEFAULT_SUBJECT_NAME = 'Soumya';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  details: string;
  task_date: string;
  start_time: string;
  end_time: string | null;
  scheduled_at: string;
  personality_id: SchedulerTask['personalityId'];
  status: SchedulerTask['status'];
  priority: SchedulerTask['priority'];
  reminder_minutes: number;
  reminder_channel: SchedulerTask['reminderChannel'];
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type PersonalityRow = {
  id: PersonalityMode['id'];
  name: string;
  short_name: string;
  purpose: string;
  identity_statement: string;
  behavior_rules: string;
  sort_order: number;
};

type SettingsRow = {
  user_id: string;
  subject_name: string;
  reminder_email: string;
  timezone: string;
  email_enabled: number;
  browser_enabled: number;
  checkin_enabled: number;
  checkin_interval_hours: number;
  checkin_start_time: string;
  checkin_end_time: string;
  checkin_last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

let database: Database.Database | null = null;

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function databasePath(): string {
  const configured = process.env.SCHEDULER_DB_PATH;
  if (!configured) return path.join(process.cwd(), 'data', 'vira-scheduler.sqlite');
  if (!path.isAbsolute(configured)) {
    throw new Error('SCHEDULER_DB_PATH must be an absolute path.');
  }
  return configured;
}

function initialize(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS personality_modes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      purpose TEXT NOT NULL,
      identity_statement TEXT NOT NULL,
      behavior_rules TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduler_settings (
      user_id TEXT PRIMARY KEY,
      subject_name TEXT NOT NULL,
      reminder_email TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0, 1)),
      browser_enabled INTEGER NOT NULL DEFAULT 1 CHECK (browser_enabled IN (0, 1)),
      checkin_enabled INTEGER NOT NULL DEFAULT 1 CHECK (checkin_enabled IN (0, 1)),
      checkin_interval_hours INTEGER NOT NULL DEFAULT 2 CHECK (checkin_interval_hours BETWEEN 1 AND 12),
      checkin_start_time TEXT NOT NULL DEFAULT '08:00',
      checkin_end_time TEXT NOT NULL DEFAULT '22:00',
      checkin_last_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduler_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      task_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      scheduled_at TEXT NOT NULL,
      personality_id TEXT NOT NULL REFERENCES personality_modes(id),
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'skipped')),
      priority INTEGER NOT NULL DEFAULT 2 CHECK (priority IN (1, 2, 3)),
      reminder_minutes INTEGER NOT NULL DEFAULT 15 CHECK (reminder_minutes BETWEEN 0 AND 1440),
      reminder_channel TEXT NOT NULL DEFAULT 'both' CHECK (reminder_channel IN ('in_app', 'email', 'both')),
      reminder_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scheduler_tasks_user_date
      ON scheduler_tasks(user_id, task_date, start_time);
    CREATE INDEX IF NOT EXISTS idx_scheduler_tasks_reminder
      ON scheduler_tasks(status, reminder_sent_at, scheduled_at);
  `);

  // Incremental migration for databases created before recurring check-ins existed.
  ensureColumn(db, 'scheduler_settings', 'checkin_enabled', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'scheduler_settings', 'checkin_interval_hours', 'INTEGER NOT NULL DEFAULT 2');
  ensureColumn(db, 'scheduler_settings', 'checkin_start_time', "TEXT NOT NULL DEFAULT '08:00'");
  ensureColumn(db, 'scheduler_settings', 'checkin_end_time', "TEXT NOT NULL DEFAULT '22:00'");
  ensureColumn(db, 'scheduler_settings', 'checkin_last_sent_at', 'TEXT');

  const upsertMode = db.prepare(`
    INSERT INTO personality_modes (
      id, name, short_name, purpose, identity_statement, behavior_rules, sort_order
    ) VALUES (
      @id, @name, @shortName, @purpose, @identityStatement, @behaviorRules, @sortOrder
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      short_name = excluded.short_name,
      purpose = excluded.purpose,
      identity_statement = excluded.identity_statement,
      behavior_rules = excluded.behavior_rules,
      sort_order = excluded.sort_order
  `);

  const seedModes = db.transaction(() => {
    for (const mode of PERSONALITY_MODES) {
      upsertMode.run({ ...mode, behaviorRules: JSON.stringify(mode.behaviorRules) });
    }
  });
  seedModes();

  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO scheduler_settings (
      user_id, subject_name, reminder_email, timezone, email_enabled, browser_enabled, created_at, updated_at
    ) VALUES (?, ?, '', ?, 1, 1, ?, ?)
  `).run(DEFAULT_USER_ID, DEFAULT_SUBJECT_NAME, DEFAULT_TIMEZONE, now, now);
}

export function getSchedulerDb(): Database.Database {
  if (database) return database;
  const filePath = databasePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  database = new Database(filePath);
  initialize(database);
  return database;
}

function mapTask(row: TaskRow): SchedulerTask {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    details: row.details,
    taskDate: row.task_date,
    startTime: row.start_time,
    endTime: row.end_time,
    scheduledAt: row.scheduled_at,
    personalityId: row.personality_id,
    status: row.status,
    priority: row.priority,
    reminderMinutes: row.reminder_minutes,
    reminderChannel: row.reminder_channel,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapPersonality(row: PersonalityRow): PersonalityMode {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    purpose: row.purpose,
    identityStatement: row.identity_statement,
    behaviorRules: JSON.parse(row.behavior_rules) as string[],
    sortOrder: row.sort_order,
  };
}

function mapSettings(row: SettingsRow): SchedulerSettings {
  return {
    userId: row.user_id,
    subjectName: row.subject_name,
    reminderEmail: row.reminder_email,
    timezone: row.timezone,
    emailEnabled: row.email_enabled === 1,
    browserEnabled: row.browser_enabled === 1,
    checkInEnabled: row.checkin_enabled === 1,
    checkInIntervalHours: row.checkin_interval_hours,
    checkInStartTime: row.checkin_start_time,
    checkInEndTime: row.checkin_end_time,
    checkInLastSentAt: row.checkin_last_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPersonalities(): PersonalityMode[] {
  const rows = getSchedulerDb()
    .prepare('SELECT * FROM personality_modes ORDER BY sort_order ASC')
    .all() as PersonalityRow[];
  return rows.map(mapPersonality);
}

export function getSchedulerSettings(userId = DEFAULT_USER_ID): SchedulerSettings {
  const row = getSchedulerDb()
    .prepare('SELECT * FROM scheduler_settings WHERE user_id = ?')
    .get(userId) as SettingsRow | undefined;
  if (!row) throw new Error(`Scheduler settings were not found for ${userId}.`);
  return mapSettings(row);
}

export function updateSchedulerSettings(
  input: Partial<Pick<SchedulerSettings,
    | 'subjectName'
    | 'reminderEmail'
    | 'timezone'
    | 'emailEnabled'
    | 'browserEnabled'
    | 'checkInEnabled'
    | 'checkInIntervalHours'
    | 'checkInStartTime'
    | 'checkInEndTime'
    | 'checkInLastSentAt'
  >>,
  userId = DEFAULT_USER_ID
): SchedulerSettings {
  const allowed: Record<string, string> = {
    subjectName: 'subject_name',
    reminderEmail: 'reminder_email',
    timezone: 'timezone',
    emailEnabled: 'email_enabled',
    browserEnabled: 'browser_enabled',
    checkInEnabled: 'checkin_enabled',
    checkInIntervalHours: 'checkin_interval_hours',
    checkInStartTime: 'checkin_start_time',
    checkInEndTime: 'checkin_end_time',
    checkInLastSentAt: 'checkin_last_sent_at',
  };
  const entries = Object.entries(input).filter(([key]) => key in allowed);
  if (entries.length === 0) return getSchedulerSettings(userId);

  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of entries) {
    assignments.push(`${allowed[key]} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  assignments.push('updated_at = ?');
  values.push(new Date().toISOString(), userId);

  getSchedulerDb()
    .prepare(`UPDATE scheduler_settings SET ${assignments.join(', ')} WHERE user_id = ?`)
    .run(...values);
  return getSchedulerSettings(userId);
}

export function getTasksForDate(date: string, userId = DEFAULT_USER_ID): SchedulerTask[] {
  const rows = getSchedulerDb()
    .prepare(`
      SELECT * FROM scheduler_tasks
      WHERE user_id = ? AND task_date = ?
      ORDER BY start_time ASC, priority ASC, created_at ASC
    `)
    .all(userId, date) as TaskRow[];
  return rows.map(mapTask);
}

export function getTask(id: string, userId = DEFAULT_USER_ID): SchedulerTask | null {
  const row = getSchedulerDb()
    .prepare('SELECT * FROM scheduler_tasks WHERE id = ? AND user_id = ?')
    .get(id, userId) as TaskRow | undefined;
  return row ? mapTask(row) : null;
}

export function createTask(input: CreateTaskInput, userId = DEFAULT_USER_ID): SchedulerTask {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getSchedulerDb()
    .prepare(`
      INSERT INTO scheduler_tasks (
        id, user_id, title, details, task_date, start_time, end_time, scheduled_at,
        personality_id, status, priority, reminder_minutes, reminder_channel,
        reminder_sent_at, created_at, updated_at, completed_at
      ) VALUES (
        @id, @userId, @title, @details, @taskDate, @startTime, @endTime, @scheduledAt,
        @personalityId, 'planned', @priority, @reminderMinutes, @reminderChannel,
        NULL, @createdAt, @updatedAt, NULL
      )
    `)
    .run({
      id,
      userId,
      title: input.title,
      details: input.details ?? '',
      taskDate: input.taskDate,
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      scheduledAt: input.scheduledAt,
      personalityId: input.personalityId,
      priority: input.priority ?? 2,
      reminderMinutes: input.reminderMinutes ?? 15,
      reminderChannel: input.reminderChannel ?? 'both',
      createdAt: now,
      updatedAt: now,
    });
  return getTask(id, userId) as SchedulerTask;
}

export function updateTask(id: string, input: UpdateTaskInput, userId = DEFAULT_USER_ID): SchedulerTask | null {
  if (!getTask(id, userId)) return null;

  const allowed: Record<string, string> = {
    title: 'title',
    details: 'details',
    taskDate: 'task_date',
    startTime: 'start_time',
    endTime: 'end_time',
    scheduledAt: 'scheduled_at',
    personalityId: 'personality_id',
    status: 'status',
    priority: 'priority',
    reminderMinutes: 'reminder_minutes',
    reminderChannel: 'reminder_channel',
  };
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!(key in allowed)) continue;
    assignments.push(`${allowed[key]} = ?`);
    values.push(value);
  }

  if (input.status === 'completed') {
    assignments.push('completed_at = ?');
    values.push(new Date().toISOString());
  } else if (input.status === 'planned' || input.status === 'skipped') {
    assignments.push('completed_at = NULL');
  }

  const reminderFields = ['title', 'taskDate', 'startTime', 'scheduledAt', 'personalityId', 'reminderMinutes', 'reminderChannel'];
  if (reminderFields.some((field) => field in input) || input.status === 'planned') {
    assignments.push('reminder_sent_at = NULL');
  }
  assignments.push('updated_at = ?');
  values.push(new Date().toISOString(), id, userId);

  getSchedulerDb()
    .prepare(`UPDATE scheduler_tasks SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...values);
  return getTask(id, userId);
}

export function deleteTask(id: string, userId = DEFAULT_USER_ID): boolean {
  const result = getSchedulerDb()
    .prepare('DELETE FROM scheduler_tasks WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}

export function getPendingReminderTasks(now = new Date(), userId = DEFAULT_USER_ID): SchedulerTask[] {
  const lower = new Date(now.getTime() - 30 * 60_000).toISOString();
  const upper = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const rows = getSchedulerDb()
    .prepare(`
      SELECT * FROM scheduler_tasks
      WHERE user_id = ?
        AND status = 'planned'
        AND reminder_sent_at IS NULL
        AND reminder_channel IN ('email', 'both')
        AND scheduled_at BETWEEN ? AND ?
      ORDER BY scheduled_at ASC
    `)
    .all(userId, lower, upper) as TaskRow[];

  return rows.map(mapTask).filter((task) => {
    const scheduled = new Date(task.scheduledAt).getTime();
    const trigger = scheduled - task.reminderMinutes * 60_000;
    return now.getTime() >= trigger && now.getTime() <= scheduled + 30 * 60_000;
  });
}

export function markReminderSent(id: string, sentAt = new Date().toISOString(), userId = DEFAULT_USER_ID): void {
  getSchedulerDb()
    .prepare('UPDATE scheduler_tasks SET reminder_sent_at = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(sentAt, sentAt, id, userId);
}

export function markCheckInSent(sentAt = new Date().toISOString(), userId = DEFAULT_USER_ID): void {
  updateSchedulerSettings({ checkInLastSentAt: sentAt }, userId);
}

export function getSchedulerSnapshot(date: string, userId = DEFAULT_USER_ID): SchedulerSnapshot {
  return {
    date,
    tasks: getTasksForDate(date, userId),
    personalities: getPersonalities(),
    settings: getSchedulerSettings(userId),
    serverTime: new Date().toISOString(),
  };
}
