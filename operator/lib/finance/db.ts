import crypto from 'crypto';
import { getSchedulerDb } from '@/lib/scheduler/db';
import { enrichTransactions } from './control';

export type FinanceDirection = 'debit' | 'credit';

export interface FinanceTransactionInput {
  sourceId: string;
  source: 'gmail' | 'statement' | 'device';
  amount: number;
  direction: FinanceDirection;
  merchant: string;
  category: string;
  occurredAt: string;
  reference: string | null;
  subject: string;
  sender: string;
}

async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const db = await getSchedulerDb();
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!columns.some((item) => item.name === column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

let initialization: Promise<void> | null = null;

function initialize(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
  await (await getSchedulerDb()).exec(`
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
      merchant TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Misc',
      occurred_at TEXT NOT NULL,
      reference TEXT,
      subject TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_date
      ON finance_transactions(occurred_at, direction);
    CREATE TABLE IF NOT EXISTS finance_import_state (
      source TEXT PRIMARY KEY,
      last_import_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  await ensureColumn('finance_transactions', 'sender', "TEXT NOT NULL DEFAULT ''");
  })();
  return initialization;
}

export async function saveFinanceTransaction(input: FinanceTransactionInput): Promise<boolean> {
  await initialize();
  const result = await (await getSchedulerDb()).prepare(`
    INSERT OR IGNORE INTO finance_transactions (
      id, source_id, source, amount, direction, merchant, category,
      occurred_at, reference, subject, sender, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(), input.sourceId, input.source, input.amount, input.direction,
    input.merchant, input.category, input.occurredAt, input.reference, input.subject, input.sender,
    new Date().toISOString()
  );
  return result.changes > 0;
}

export async function getExistingFinanceSourceIds(sourceIds: string[]): Promise<Set<string>> {
  await initialize();
  if (sourceIds.length === 0) return new Set();
  const existing = new Set<string>();
  for (let offset = 0; offset < sourceIds.length; offset += 500) {
    const batch = sourceIds.slice(offset, offset + 500);
    const placeholders = batch.map(() => '?').join(',');
    const rows = await (await getSchedulerDb()).prepare(
      `SELECT source_id AS sourceId FROM finance_transactions WHERE source_id IN (${placeholders})`
    ).all<{ sourceId: string }>(...batch);
    for (const row of rows) existing.add(row.sourceId);
  }
  return existing;
}

export async function setFinanceImportState(error: string | null): Promise<void> {
  await initialize();
  const now = new Date().toISOString();
  await (await getSchedulerDb()).prepare(`
    INSERT INTO finance_import_state (source, last_import_at, last_error, updated_at)
    VALUES ('gmail', ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      last_import_at = CASE WHEN excluded.last_error IS NULL THEN excluded.updated_at ELSE finance_import_state.last_import_at END,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(error ? null : now, error, now);
}

export async function getFinanceImportState(): Promise<{ lastImportAt: string | null; lastError: string | null }> {
  await initialize();
  const row = await (await getSchedulerDb()).prepare(
    "SELECT last_import_at AS lastImportAt, last_error AS lastError FROM finance_import_state WHERE source = 'gmail'"
  ).get<{ lastImportAt: string | null; lastError: string | null }>();
  return row ?? { lastImportAt: null, lastError: null };
}

export async function getFinanceTransactionsForMonth(startIso: string, endIso: string): Promise<FinanceTransactionInput[]> {
  await initialize();
  return await (await getSchedulerDb()).prepare(`
    SELECT source_id AS sourceId, source, amount, direction, merchant, category,
      occurred_at AS occurredAt, reference, subject, sender
    FROM finance_transactions
    WHERE occurred_at >= ? AND occurred_at < ?
    ORDER BY occurred_at DESC
  `).all<FinanceTransactionInput>(startIso, endIso);
}

export async function financeStatementAlreadyImported(fingerprint: string): Promise<boolean> {
  await initialize();
  await (await getSchedulerDb()).exec(`
    CREATE TABLE IF NOT EXISTS finance_statement_imports (
      fingerprint TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      transaction_count INTEGER NOT NULL,
      imported_at TEXT NOT NULL
    );
  `);
  return Boolean(await (await getSchedulerDb()).prepare(
    'SELECT 1 FROM finance_statement_imports WHERE fingerprint = ?'
  ).get(fingerprint));
}

export async function recordFinanceStatementImport(fingerprint: string, filename: string, transactionCount: number): Promise<void> {
  await initialize();
  await (await getSchedulerDb()).exec(`
    CREATE TABLE IF NOT EXISTS finance_statement_imports (
      fingerprint TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      transaction_count INTEGER NOT NULL,
      imported_at TEXT NOT NULL
    );
  `);
  await (await getSchedulerDb()).prepare(`
    INSERT OR REPLACE INTO finance_statement_imports (fingerprint, filename, transaction_count, imported_at)
    VALUES (?, ?, ?, ?)
  `).run(fingerprint, filename, transactionCount, new Date().toISOString());
}

export interface FinanceHistoryTransaction {
  sourceId: string;
  amount: number;
  direction: FinanceDirection;
  merchant: string;
  category: string;
  occurredAt: string;
  reference: string | null;
  source: string;
}

export interface FinanceMonthSummary {
  month: string;
  transactionCount: number;
  spent: number;
  received: number;
}

export async function getFinanceMonthSummaries(): Promise<FinanceMonthSummary[]> {
  await initialize();
  return await (await getSchedulerDb()).prepare(`
    SELECT
      substr(occurred_at, 1, 7) AS month,
      COUNT(*) AS transactionCount,
      ROUND(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 2) AS spent,
      ROUND(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 2) AS received
    FROM finance_transactions
    GROUP BY substr(occurred_at, 1, 7)
    ORDER BY month DESC
  `).all<FinanceMonthSummary>();
}

export async function getFinanceHistoryTransactions(month: string) {
  await initialize();
  return enrichTransactions(await (await getSchedulerDb()).prepare(`
    SELECT source_id AS sourceId, amount, direction, merchant, category,
      occurred_at AS occurredAt, reference, source
    FROM finance_transactions
    WHERE substr(occurred_at, 1, 7) = ?
    ORDER BY occurred_at DESC, source_id DESC
  `).all<FinanceHistoryTransaction>(month));
}
