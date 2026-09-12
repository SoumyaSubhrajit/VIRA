import crypto from 'crypto';
import { getSchedulerDb } from '@/lib/scheduler/db';
import type { NotionEntityType, NotionEventType, NotionOutboxEvent, NotionSettings, NotionStatus } from './types';
import { notionToken } from './client';

const DEFAULT_USER_ID = 'default-user';

type SettingsRow = {
  user_id: string;
  enabled: number;
  parent_page_id: string | null;
  projects_database_id: string | null;
  projects_data_source_id: string | null;
  work_items_database_id: string | null;
  work_items_data_source_id: string | null;
  daily_logs_database_id: string | null;
  daily_logs_data_source_id: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  entity_type: NotionEntityType;
  entity_id: string;
  event_type: NotionEventType;
  payload_json: string;
  attempts: number;
};

let initialization: Promise<void> | null = null;

function initialize(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
  const db = await getSchedulerDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notion_settings (
      user_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      parent_page_id TEXT,
      projects_database_id TEXT,
      projects_data_source_id TEXT,
      work_items_database_id TEXT,
      work_items_data_source_id TEXT,
      daily_logs_database_id TEXT,
      daily_logs_data_source_id TEXT,
      last_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notion_links (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      notion_page_id TEXT NOT NULL,
      content_hash TEXT,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS notion_outbox (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('upsert', 'archive')),
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notion_outbox_due
      ON notion_outbox(status, next_attempt_at, created_at);
  `);
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT OR IGNORE INTO notion_settings (user_id, enabled, created_at, updated_at)
    VALUES (?, 1, ?, ?)
  `).run(DEFAULT_USER_ID, now, now);
  })();
  return initialization;
}

function mapSettings(row: SettingsRow): NotionSettings {
  return {
    userId: row.user_id,
    enabled: row.enabled === 1,
    parentPageId: row.parent_page_id,
    projectsDatabaseId: row.projects_database_id,
    projectsDataSourceId: row.projects_data_source_id,
    workItemsDatabaseId: row.work_items_database_id,
    workItemsDataSourceId: row.work_items_data_source_id,
    dailyLogsDatabaseId: row.daily_logs_database_id,
    dailyLogsDataSourceId: row.daily_logs_data_source_id,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getNotionSettings(userId = DEFAULT_USER_ID): Promise<NotionSettings> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare('SELECT * FROM notion_settings WHERE user_id = ?').get<SettingsRow>(userId) as SettingsRow;
  return mapSettings(row);
}

export async function saveNotionWorkspace(input: Partial<Omit<NotionSettings, 'userId' | 'createdAt' | 'updatedAt'>>, userId = DEFAULT_USER_ID): Promise<NotionSettings> {
  await initialize();
  const columns: Record<string, string> = {
    enabled: 'enabled',
    parentPageId: 'parent_page_id',
    projectsDatabaseId: 'projects_database_id',
    projectsDataSourceId: 'projects_data_source_id',
    workItemsDatabaseId: 'work_items_database_id',
    workItemsDataSourceId: 'work_items_data_source_id',
    dailyLogsDatabaseId: 'daily_logs_database_id',
    dailyLogsDataSourceId: 'daily_logs_data_source_id',
    lastSyncAt: 'last_sync_at',
    lastError: 'last_error',
  };
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!columns[key]) continue;
    assignments.push(`${columns[key]} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  if (!assignments.length) return getNotionSettings(userId);
  assignments.push('updated_at = ?');
  values.push(new Date().toISOString(), userId);
  await (await getSchedulerDb()).prepare(`UPDATE notion_settings SET ${assignments.join(', ')} WHERE user_id = ?`).run(...values);
  return getNotionSettings(userId);
}

export async function getNotionStatus(userId = DEFAULT_USER_ID): Promise<NotionStatus> {
  const settings = await getNotionSettings(userId);
  const db = await getSchedulerDb();
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM notion_outbox WHERE status IN ('pending', 'processing')").get<{ count: number }>() as { count: number };
  const failed = await db.prepare("SELECT COUNT(*) AS count FROM notion_outbox WHERE status = 'failed'").get<{ count: number }>() as { count: number };
  return {
    tokenPresent: Boolean(notionToken()),
    configured: Boolean(notionToken() && settings.workItemsDataSourceId && settings.dailyLogsDataSourceId),
    enabled: settings.enabled,
    parentPageId: settings.parentPageId,
    projectsDataSourceId: settings.projectsDataSourceId,
    workItemsDataSourceId: settings.workItemsDataSourceId,
    dailyLogsDataSourceId: settings.dailyLogsDataSourceId,
    lastSyncAt: settings.lastSyncAt,
    lastError: settings.lastError,
    pendingEvents: pending.count,
    failedEvents: failed.count,
  };
}

export async function enqueueNotionEvent(entityType: NotionEntityType, entityId: string, eventType: NotionEventType, payload: Record<string, unknown> = {}): Promise<string> {
  await initialize();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare(`
    INSERT INTO notion_outbox (
      id, entity_type, entity_id, event_type, payload_json, status, attempts,
      next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
  `).run(id, entityType, entityId, eventType, JSON.stringify(payload), now, now, now);
  return id;
}

export async function claimDueNotionEvents(limit = 50): Promise<NotionOutboxEvent[]> {
  await initialize();
  const db = await getSchedulerDb();
  const now = new Date().toISOString();
  const rows = await db.prepare(`
    SELECT id, entity_type, entity_id, event_type, payload_json, attempts
    FROM notion_outbox
    WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?
    ORDER BY created_at ASC LIMIT ?
  `).all<EventRow>(now, limit);
  const transaction = db.transaction(async (transactionDb) => {
    const claim = transactionDb.prepare("UPDATE notion_outbox SET status = 'processing', updated_at = ? WHERE id = ?");
    for (const row of rows) await claim.run(now, row.id);
  });
  await transaction();
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    attempts: row.attempts,
  }));
}

export async function markNotionEventSent(id: string): Promise<void> {
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare("UPDATE notion_outbox SET status = 'sent', last_error = NULL, updated_at = ? WHERE id = ?").run(now, id);
}

export async function markNotionEventFailed(id: string, attempts: number, error: string): Promise<void> {
  const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5));
  const next = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  await (await getSchedulerDb()).prepare(`
    UPDATE notion_outbox SET status = 'failed', attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(attempts, next, error.slice(0, 1000), new Date().toISOString(), id);
}

export async function getNotionLink(entityType: NotionEntityType, entityId: string): Promise<string | null> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare(
    'SELECT notion_page_id FROM notion_links WHERE entity_type = ? AND entity_id = ?'
  ).get<{ notion_page_id: string }>(entityType, entityId);
  return row?.notion_page_id ?? null;
}

export async function saveNotionLink(entityType: NotionEntityType, entityId: string, notionPageId: string, contentHash: string): Promise<void> {
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare(`
    INSERT INTO notion_links (entity_type, entity_id, notion_page_id, content_hash, last_synced_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      notion_page_id = excluded.notion_page_id,
      content_hash = excluded.content_hash,
      last_synced_at = excluded.last_synced_at
  `).run(entityType, entityId, notionPageId, contentHash, now);
}
