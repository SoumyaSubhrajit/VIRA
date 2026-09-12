import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { MemoryEntry, GuideObservation } from './types';
import { createDatabase, type AsyncDatabase } from './database';

const MEMORY_FILE = path.join(process.cwd(), 'data', 'agent_memory.json');
const DATABASE_FILE = path.join(process.cwd(), 'data', 'vira-scheduler.sqlite');
const MAX_ENTRIES = 100;

let databasePromise: Promise<AsyncDatabase> | null = null;

async function database(): Promise<AsyncDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = (async () => {
    const db = createDatabase(DATABASE_FILE);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        observation TEXT NOT NULL,
        suggested_action TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_memory_user_created
        ON agent_memory(user_id, created_at DESC);
    `);

    const count = await db.prepare('SELECT COUNT(*) AS count FROM agent_memory').get() as { count: number };
    if (Number(count.count) === 0 && fs.existsSync(MEMORY_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8')) as MemoryEntry[] | Record<string, MemoryEntry[]>;
        const grouped = Array.isArray(parsed) ? { 'default-user': parsed } : parsed;
        await db.transaction(async (transaction) => {
          for (const [userId, entries] of Object.entries(grouped)) {
            for (const entry of entries.slice(0, MAX_ENTRIES)) {
              await transaction.prepare(`
                INSERT OR IGNORE INTO agent_memory(id,user_id,observation,suggested_action,severity,created_at)
                VALUES(?,?,?,?,?,?)
              `).run(entry.id || crypto.randomUUID(), userId, entry.observation, entry.suggested_action, entry.severity, entry.timestamp);
            }
          }
        })();
      } catch (error) {
        console.warn('[memory] Existing JSON memory could not be imported:', error);
      }
    }
    return db;
  })();
  return databasePromise;
}

export async function getMemory(userId: string): Promise<MemoryEntry[]> {
  const rows = await (await database()).prepare(`
    SELECT id,observation,suggested_action,severity,created_at
    FROM agent_memory WHERE user_id=? ORDER BY created_at DESC LIMIT ?
  `).all(userId, MAX_ENTRIES) as Array<{ id: string; observation: string; suggested_action: string; severity: MemoryEntry['severity']; created_at: string }>;
  return rows.map((row) => ({
    id: row.id,
    observation: row.observation,
    suggested_action: row.suggested_action,
    severity: row.severity,
    timestamp: row.created_at,
  }));
}

export async function saveMemory(userId: string, observation: GuideObservation): Promise<MemoryEntry> {
  const entry: MemoryEntry = {
    ...observation,
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
  };
  const db = await database();
  await db.transaction(async (transaction) => {
    await transaction.prepare(`
      INSERT INTO agent_memory(id,user_id,observation,suggested_action,severity,created_at)
      VALUES(?,?,?,?,?,?)
    `).run(entry.id, userId, entry.observation, entry.suggested_action, entry.severity, entry.timestamp);
    await transaction.prepare(`
      DELETE FROM agent_memory WHERE user_id=? AND id NOT IN (
        SELECT id FROM agent_memory WHERE user_id=? ORDER BY created_at DESC LIMIT ?
      )
    `).run(userId, userId, MAX_ENTRIES);
  })();
  return entry;
}
