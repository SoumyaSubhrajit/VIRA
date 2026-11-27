import { getSchedulerDb } from '@/lib/scheduler/db';
import { scrubSensitiveFinanceText } from '@/lib/security/crypto';
import type { FoldTransaction } from './foldClient';

export const ALLOWED_CATEGORIES = [
  'Bill',
  'Food & Drinks',
  'Transport',
  'Groceries',
  'Shopping',
  'Subscription',
  'Entertainment',
  'Investment',
  'Medical',
  'Transfers & P2P',
  'Other',
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_CATEGORIES);

let initialized: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getSchedulerDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS fold_ai_categories (
        tx_id TEXT PRIMARY KEY,
        merchant_key TEXT NOT NULL,
        category TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fold_ai_cat_merchant
        ON fold_ai_categories(merchant_key);
    `);
  })();
  return initialized;
}

function normalizeMerchantKey(tx: FoldTransaction): string {
  const raw = (tx.merchant_name || tx.narration || '').trim().toLowerCase();
  return raw.replace(/\d{6,}/g, '').replace(/\s+/g, ' ').slice(0, 80);
}

export function isUntaggedFoldTx(tx: FoldTransaction): boolean {
  if (tx.type !== 'DEBIT') return false;
  const name = tx.category?.name?.trim().toLowerCase() ?? '';
  return !name || name === 'untagged' || name === 'uncategorized' || name === 'unknown';
}

export async function classifyUntaggedFoldTransactions(
  transactions: FoldTransaction[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const untagged = transactions.filter(isUntaggedFoldTx);
  if (untagged.length === 0) return result;

  await ensureTable();
  const db = await getSchedulerDb();

  // 1. Check SQLite cache by tx_id and merchant_key
  const cachedByTx = await db
    .prepare('SELECT tx_id AS txId, category FROM fold_ai_categories')
    .all<{ txId: string; category: string }>();
  const txCacheMap = new Map(cachedByTx.map((r) => [r.txId, r.category]));

  const cachedByMerchant = await db
    .prepare("SELECT merchant_key AS merchantKey, category FROM fold_ai_categories WHERE merchant_key != ''")
    .all<{ merchantKey: string; category: string }>();
  const merchantCacheMap = new Map(cachedByMerchant.map((r) => [r.merchantKey, r.category]));

  const pending: FoldTransaction[] = [];
  for (const tx of untagged) {
    const byId = txCacheMap.get(tx.id);
    if (byId && ALLOWED_SET.has(byId)) {
      result.set(tx.id, byId);
      continue;
    }
    const mKey = normalizeMerchantKey(tx);
    const byMerchant = mKey ? merchantCacheMap.get(mKey) : undefined;
    if (byMerchant && ALLOWED_SET.has(byMerchant)) {
      result.set(tx.id, byMerchant);
      continue;
    }
    pending.push(tx);
  }

  // 2. Classify uncached untagged transactions in one batch via OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (pending.length === 0 || !apiKey) return result;

  const batch = pending.slice(0, 60);
  const items = batch.map((tx) => ({
    id: tx.id,
    merchant: scrubSensitiveFinanceText(tx.merchant_name || ''),
    narration: scrubSensitiveFinanceText(tx.narration || ''),
    amount: Math.round(tx.effective_amount || tx.amount),
  }));

  try {
    const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You categorize Indian UPI & bank debit transactions.
Choose strictly ONE category per transaction from: ${ALLOWED_CATEGORIES.join(', ')}.
Use "Transfers & P2P" when narration looks like a personal name/P2P UPI transfer (e.g. person names, family, friends).
Return valid JSON: { "classifications": { "<id>": "<Category>" } }.`,
          },
          {
            role: 'user',
            content: JSON.stringify({ transactions: items }),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[foldCategorizer] OpenAI HTTP error:', response.status);
      return result;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return result;

    const parsed = JSON.parse(content) as { classifications?: Record<string, string> };
    const map = parsed.classifications ?? {};
    const now = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO fold_ai_categories (tx_id, merchant_key, category, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(tx_id) DO UPDATE SET
        category = excluded.category,
        updated_at = excluded.updated_at
    `);

    for (const tx of batch) {
      const cat = map[tx.id];
      if (!cat || !ALLOWED_SET.has(cat)) continue;
      result.set(tx.id, cat);
      await insert.run(tx.id, normalizeMerchantKey(tx), cat, now);
    }
  } catch (err) {
    console.error('[foldCategorizer] Error:', err);
  }

  return result;
}

export function applyAiCategoriesToSummary(
  baseCategories: Array<{ name: string; spent: number; budget: number }>,
  untaggedAmount: number,
  monthTransactions: FoldTransaction[],
  aiMap: Map<string, string>,
  defaultBudgets: Record<string, number>,
): Array<{ name: string; spent: number; budget: number }> {
  const catMap = new Map<string, { name: string; spent: number; budget: number }>();
  for (const c of baseCategories) {
    catMap.set(c.name, { ...c });
  }

  let remainingUntagged = Math.round(untaggedAmount);

  for (const tx of monthTransactions) {
    if (!isUntaggedFoldTx(tx)) continue;
    const aiCat = aiMap.get(tx.id);
    if (!aiCat || aiCat === 'Other') continue;

    const amt = Math.round(tx.effective_amount || tx.amount);
    if (amt <= 0) continue;

    const existing = catMap.get(aiCat);
    if (existing) {
      existing.spent += amt;
    } else {
      catMap.set(aiCat, {
        name: aiCat,
        spent: amt,
        budget: defaultBudgets[aiCat] ?? Math.max(Math.round(amt * 1.2), 2000),
      });
    }
    remainingUntagged = Math.max(0, remainingUntagged - amt);
  }

  if (remainingUntagged > 0) {
    const existingOther = catMap.get('Untagged / Other');
    if (existingOther) {
      existingOther.spent += remainingUntagged;
    } else {
      catMap.set('Untagged / Other', {
        name: 'Untagged / Other',
        spent: remainingUntagged,
        budget: defaultBudgets['Untagged / Other'] ?? defaultBudgets['Misc'] ?? 5000,
      });
    }
  }

  return [...catMap.values()].sort((a, b) => b.spent - a.spent);
}
