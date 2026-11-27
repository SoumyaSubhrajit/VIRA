import { getSchedulerDb } from '@/lib/scheduler/db';

let initialized: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getSchedulerDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS finance_report_insights (
        cache_key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        bullets_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  })();
  return initialized;
}

async function generateBullets(
  cacheKey: string,
  fingerprint: string,
  promptPayload: unknown,
  scopeLabel: string,
): Promise<string[]> {
  await ensureTable();
  const db = await getSchedulerDb();

  const cached = await db
    .prepare('SELECT fingerprint, bullets_json AS bulletsJson FROM finance_report_insights WHERE cache_key = ?')
    .get<{ fingerprint: string; bulletsJson: string }>(cacheKey);

  if (cached && cached.fingerprint === fingerprint) {
    try {
      const parsed = JSON.parse(cached.bulletsJson) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // regenerate
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You write crisp 3-bullet ${scopeLabel} personal spending takeaways (INR ₹). Keep each bullet under 18 words, factual, practical, zero fluff or shame. Return valid JSON: { "bullets": ["...", "...", "..."] }.`,
          },
          {
            role: 'user',
            content: JSON.stringify(promptPayload),
          },
        ],
      }),
    });

    if (!response.ok) return [];
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as { bullets?: string[] };
    const bullets = (parsed.bullets ?? [])
      .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      .slice(0, 3);

    if (bullets.length > 0) {
      await db
        .prepare(`
          INSERT INTO finance_report_insights (cache_key, fingerprint, bullets_json, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            fingerprint = excluded.fingerprint,
            bullets_json = excluded.bullets_json,
            updated_at = excluded.updated_at
        `)
        .run(cacheKey, fingerprint, JSON.stringify(bullets), new Date().toISOString());
    }
    return bullets;
  } catch (err) {
    console.warn('[financeInsights] Failed:', err);
    return [];
  }
}

export async function getFinanceReportInsights(input: {
  monthKey: string;
  monthSpent: number;
  monthBudget: number;
  prevMonthSpent: number | null;
  topMonthCategories: Array<{ name: string; spent: number }>;
  year: number;
  yearlyTotal: number;
  yearlyAvg: number;
  bestMonth: { label: string; spent: number } | null;
  worstMonth: { label: string; spent: number } | null;
  topYearCategories: Array<{ name: string; spent: number }>;
}): Promise<{ monthly: string[]; yearly: string[] }> {
  const monthFp = `${input.monthSpent}:${input.prevMonthSpent ?? 0}:${input.topMonthCategories.slice(0, 4).map((c) => `${c.name}=${c.spent}`).join(',')}`;
  const yearFp = `${input.yearlyTotal}:${input.topYearCategories.slice(0, 4).map((c) => `${c.name}=${c.spent}`).join(',')}`;

  const [monthly, yearly] = await Promise.all([
    input.monthSpent > 0
      ? generateBullets(
          `month:${input.monthKey}`,
          monthFp,
          {
            month: input.monthKey,
            spentInr: input.monthSpent,
            budgetInr: input.monthBudget,
            previousMonthSpentInr: input.prevMonthSpent,
            topCategories: input.topMonthCategories.slice(0, 5),
          },
          'monthly finance',
        )
      : Promise.resolve([]),
    input.yearlyTotal > 0
      ? generateBullets(
          `year:${input.year}`,
          yearFp,
          {
            year: input.year,
            totalSpentInr: input.yearlyTotal,
            avgPerMonthInr: input.yearlyAvg,
            lowestMonth: input.bestMonth,
            highestMonth: input.worstMonth,
            topCategories: input.topYearCategories.slice(0, 5),
          },
          'yearly finance',
        )
      : Promise.resolve([]),
  ]);

  return { monthly, yearly };
}
