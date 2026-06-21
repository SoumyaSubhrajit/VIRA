import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { MemoryEntry, GuideObservation } from './types';

const MEMORY_FILE = path.join(process.cwd(), 'data', 'agent_memory.json');
const MAX_ENTRIES = 100;

function generateId(): string {
  return crypto.randomUUID();
}

export function getMemory(_userId: string): MemoryEntry[] {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // Support both { "default-user": [...] } and flat array formats
    if (Array.isArray(parsed)) return parsed;
    return parsed[_userId] ?? [];
  } catch {
    return [];
  }
}

export function saveMemory(_userId: string, observation: GuideObservation): MemoryEntry {
  const entries = getMemory(_userId);
  const newEntry: MemoryEntry = {
    ...observation,
    timestamp: new Date().toISOString(),
    id: generateId(),
  };
  entries.unshift(newEntry); // newest first
  const trimmed = entries.slice(0, MAX_ENTRIES);

  const existing = (() => {
    try {
      if (!fs.existsSync(MEMORY_FILE)) return {};
      const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? {} : parsed;
    } catch {
      return {};
    }
  })();

  existing[_userId] = trimmed;
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  return newEntry;
}
