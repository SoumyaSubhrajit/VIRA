import { getSchedulerDb } from '@/lib/scheduler/db';
import type { GoogleConnectionRecord, GoogleTaskLink } from './types';

const DEFAULT_USER_ID = 'default-user';

type ConnectionRow = {
  user_id: string;
  email: string;
  encrypted_tokens: string;
  scopes: string;
  task_list_id: string;
  task_list_title: string;
  calendar_id: string;
  calendar_sync_enabled: number;
  tasks_sync_enabled: number;
  gmail_send_enabled: number;
  connected_at: string;
  updated_at: string;
};

type LinkRow = {
  local_task_id: string;
  calendar_event_id: string | null;
  google_task_id: string | null;
  synced_at: string | null;
  sync_error: string | null;
};

let initialization: Promise<void> | null = null;

function initialize(): Promise<void> {
  initialization ??= (async () => (await getSchedulerDb()).exec(`
    CREATE TABLE IF NOT EXISTS google_connections (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      encrypted_tokens TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      task_list_id TEXT NOT NULL DEFAULT '',
      task_list_title TEXT NOT NULL DEFAULT 'VIRA Daily Command',
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      calendar_sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK (calendar_sync_enabled IN (0, 1)),
      tasks_sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tasks_sync_enabled IN (0, 1)),
      gmail_send_enabled INTEGER NOT NULL DEFAULT 1 CHECK (gmail_send_enabled IN (0, 1)),
      connected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS google_task_links (
      local_task_id TEXT PRIMARY KEY REFERENCES scheduler_tasks(id) ON DELETE CASCADE,
      calendar_event_id TEXT,
      google_task_id TEXT,
      synced_at TEXT,
      sync_error TEXT
    );
  `))();
  return initialization;
}

function mapConnection(row: ConnectionRow): GoogleConnectionRecord {
  return {
    userId: row.user_id,
    email: row.email,
    encryptedTokens: row.encrypted_tokens,
    scopes: JSON.parse(row.scopes) as string[],
    taskListId: row.task_list_id,
    taskListTitle: row.task_list_title,
    calendarId: row.calendar_id,
    calendarSyncEnabled: row.calendar_sync_enabled === 1,
    tasksSyncEnabled: row.tasks_sync_enabled === 1,
    gmailSendEnabled: row.gmail_send_enabled === 1,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

function mapLink(row: LinkRow): GoogleTaskLink {
  return {
    localTaskId: row.local_task_id,
    calendarEventId: row.calendar_event_id,
    googleTaskId: row.google_task_id,
    syncedAt: row.synced_at,
    syncError: row.sync_error,
  };
}

export async function getGoogleConnection(userId = DEFAULT_USER_ID): Promise<GoogleConnectionRecord | null> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare('SELECT * FROM google_connections WHERE user_id = ?').get<ConnectionRow>(userId);
  return row ? mapConnection(row) : null;
}

export async function saveGoogleConnection(
  input: Omit<GoogleConnectionRecord, 'userId' | 'connectedAt' | 'updatedAt'>,
  userId = DEFAULT_USER_ID
): Promise<GoogleConnectionRecord> {
  await initialize();
  const existing = await getGoogleConnection(userId);
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare(`
    INSERT INTO google_connections (
      user_id, email, encrypted_tokens, scopes, task_list_id, task_list_title, calendar_id,
      calendar_sync_enabled, tasks_sync_enabled, gmail_send_enabled, connected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      encrypted_tokens = excluded.encrypted_tokens,
      scopes = excluded.scopes,
      task_list_id = excluded.task_list_id,
      task_list_title = excluded.task_list_title,
      calendar_id = excluded.calendar_id,
      calendar_sync_enabled = excluded.calendar_sync_enabled,
      tasks_sync_enabled = excluded.tasks_sync_enabled,
      gmail_send_enabled = excluded.gmail_send_enabled,
      updated_at = excluded.updated_at
  `).run(
    userId,
    input.email,
    input.encryptedTokens,
    JSON.stringify(input.scopes),
    input.taskListId,
    input.taskListTitle,
    input.calendarId,
    input.calendarSyncEnabled ? 1 : 0,
    input.tasksSyncEnabled ? 1 : 0,
    input.gmailSendEnabled ? 1 : 0,
    existing?.connectedAt ?? now,
    now
  );
  return await getGoogleConnection(userId) as GoogleConnectionRecord;
}

export async function updateGoogleConnection(
  input: Partial<Pick<GoogleConnectionRecord,
    | 'encryptedTokens'
    | 'scopes'
    | 'taskListId'
    | 'taskListTitle'
    | 'calendarSyncEnabled'
    | 'tasksSyncEnabled'
    | 'gmailSendEnabled'
  >>,
  userId = DEFAULT_USER_ID
): Promise<GoogleConnectionRecord | null> {
  const current = await getGoogleConnection(userId);
  if (!current) return null;
  return saveGoogleConnection({
    email: current.email,
    encryptedTokens: input.encryptedTokens ?? current.encryptedTokens,
    scopes: input.scopes ?? current.scopes,
    taskListId: input.taskListId ?? current.taskListId,
    taskListTitle: input.taskListTitle ?? current.taskListTitle,
    calendarId: current.calendarId,
    calendarSyncEnabled: input.calendarSyncEnabled ?? current.calendarSyncEnabled,
    tasksSyncEnabled: input.tasksSyncEnabled ?? current.tasksSyncEnabled,
    gmailSendEnabled: input.gmailSendEnabled ?? current.gmailSendEnabled,
  }, userId);
}

export async function deleteGoogleConnection(userId = DEFAULT_USER_ID): Promise<void> {
  await initialize();
  const db = await getSchedulerDb();
  await db.transaction(async (transaction) => {
    await transaction.prepare('DELETE FROM google_task_links').run();
    await transaction.prepare('DELETE FROM google_connections WHERE user_id = ?').run(userId);
  })();
}

export async function getGoogleTaskLink(localTaskId: string): Promise<GoogleTaskLink | null> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare('SELECT * FROM google_task_links WHERE local_task_id = ?').get<LinkRow>(localTaskId);
  return row ? mapLink(row) : null;
}

export async function saveGoogleTaskLink(link: GoogleTaskLink): Promise<GoogleTaskLink> {
  await initialize();
  await (await getSchedulerDb()).prepare(`
    INSERT INTO google_task_links (local_task_id, calendar_event_id, google_task_id, synced_at, sync_error)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(local_task_id) DO UPDATE SET
      calendar_event_id = excluded.calendar_event_id,
      google_task_id = excluded.google_task_id,
      synced_at = excluded.synced_at,
      sync_error = excluded.sync_error
  `).run(link.localTaskId, link.calendarEventId, link.googleTaskId, link.syncedAt, link.syncError);
  return await getGoogleTaskLink(link.localTaskId) as GoogleTaskLink;
}

export async function deleteGoogleTaskLink(localTaskId: string): Promise<void> {
  await initialize();
  await (await getSchedulerDb()).prepare('DELETE FROM google_task_links WHERE local_task_id = ?').run(localTaskId);
}
