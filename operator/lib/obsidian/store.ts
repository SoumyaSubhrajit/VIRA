import path from 'path';
import { getSchedulerDb } from '@/lib/scheduler/db';
import type { ObsidianSettings } from './types';

const USER_ID = 'default-user';

type SettingsRow = {
  user_id: string;
  enabled: number;
  vault_path: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

async function initialize(): Promise<void> {
  const now = new Date().toISOString();
  const defaultVault = process.env.OBSIDIAN_VAULT_PATH?.trim() ?? '';
  const db = await getSchedulerDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS obsidian_settings (
      user_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      vault_path TEXT NOT NULL DEFAULT '',
      last_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await db.prepare(`
    INSERT OR IGNORE INTO obsidian_settings (
      user_id, enabled, vault_path, created_at, updated_at
    ) VALUES (?, 1, ?, ?, ?)
  `).run(USER_ID, defaultVault, now, now);

  if (defaultVault) {
    await db.prepare(`
      UPDATE obsidian_settings
      SET vault_path = CASE WHEN vault_path = '' THEN ? ELSE vault_path END,
          updated_at = CASE WHEN vault_path = '' THEN ? ELSE updated_at END
      WHERE user_id = ?
    `).run(defaultVault, now, USER_ID);
  }
}

function mapSettings(row: SettingsRow): ObsidianSettings {
  return {
    userId: row.user_id,
    enabled: row.enabled === 1,
    vaultPath: row.vault_path,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateVaultPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new Error('Obsidian vault path must be an absolute local path.');
  }
  const resolved = path.resolve(trimmed);
  if (resolved.toLowerCase() === path.parse(resolved).root.toLowerCase()) {
    throw new Error('Choose a dedicated vault folder, not the root of a drive.');
  }
  return resolved;
}

export async function getObsidianSettings(): Promise<ObsidianSettings> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare('SELECT * FROM obsidian_settings WHERE user_id = ?').get<SettingsRow>(USER_ID) as SettingsRow;
  return mapSettings(row);
}

export async function updateObsidianSettings(input: { vaultPath?: string; enabled?: boolean }): Promise<ObsidianSettings> {
  await initialize();
  const current = await getObsidianSettings();
  const vaultPath = input.vaultPath === undefined ? current.vaultPath : validateVaultPath(input.vaultPath);
  const enabled = input.enabled === undefined ? current.enabled : input.enabled;
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare(`
    UPDATE obsidian_settings
    SET enabled = ?, vault_path = ?, last_error = NULL, updated_at = ?
    WHERE user_id = ?
  `).run(enabled ? 1 : 0, vaultPath, now, USER_ID);
  return getObsidianSettings();
}

export async function recordObsidianSync(success: boolean, message: string | null): Promise<void> {
  await initialize();
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare(`
    UPDATE obsidian_settings
    SET last_sync_at = CASE WHEN ? = 1 THEN ? ELSE last_sync_at END,
        last_error = ?, updated_at = ?
    WHERE user_id = ?
  `).run(success ? 1 : 0, now, success ? null : message, now, USER_ID);
}

export async function getObsidianStatus() {
  const settings = await getObsidianSettings();
  return { ...settings, configured: settings.enabled && Boolean(settings.vaultPath) };
}
