import crypto from 'crypto';
import { getSchedulerDb } from '@/lib/scheduler/db';
import { RADAR_CATEGORIES, type RadarCategory, type TechRadarItem } from './types';

export { RADAR_CATEGORIES, type RadarCategory, type TechRadarItem };

interface RawSignal {
  title: string;
  url: string;
  source: 'Hacker News' | 'GitHub' | 'DEV.to';
  metric: string;
  description: string;
}

let initialized: Promise<void> | null = null;

async function ensureTables(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getSchedulerDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tech_radar_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        category TEXT NOT NULL,
        metric TEXT NOT NULL,
        tldr TEXT NOT NULL,
        how_to_use TEXT NOT NULL,
        saved INTEGER NOT NULL DEFAULT 0,
        fetched_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tech_radar_date
        ON tech_radar_items(fetched_date DESC, saved DESC);
    `);
  })();
  return initialized;
}

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysAgoIso(days: number): string {
  const dt = new Date(Date.now() - days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

async function fetchHackerNews(): Promise<RawSignal[]> {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!topRes.ok) return [];
    const ids = ((await topRes.json()) as number[]).slice(0, 14);

    const stories = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok) return null;
          return (await r.json()) as { title?: string; url?: string; score?: number; id: number };
        } catch {
          return null;
        }
      }),
    );

    return stories
      .filter((s): s is { title: string; url?: string; score?: number; id: number } => Boolean(s?.title))
      .map((s) => ({
        title: s.title,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        source: 'Hacker News' as const,
        metric: `▲ ${s.score ?? 0}`,
        description: s.title,
      }));
  } catch {
    return [];
  }
}

async function fetchGithubHot(): Promise<RawSignal[]> {
  const results: RawSignal[] = [];
  const since30 = daysAgoIso(30);
  const since14 = daysAgoIso(14);
  const queries = [
    `created:>${since30} stars:>150`,
    `(topic:dotnet OR topic:csharp OR topic:playwright OR topic:security) pushed:>${since14} stars:>200`,
  ];

  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=8`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'VIRA-Personal-OS',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        items?: Array<{
          full_name: string;
          html_url: string;
          description: string | null;
          stargazers_count: number;
          language: string | null;
        }>;
      };
      for (const repo of json.items ?? []) {
        results.push({
          title: repo.full_name,
          url: repo.html_url,
          source: 'GitHub',
          metric: `★ ${repo.stargazers_count.toLocaleString('en-US')}`,
          description: `${repo.language ? `[${repo.language}] ` : ''}${repo.description || repo.full_name}`,
        });
      }
    } catch {
      // ignore partial failure
    }
  }
  return results;
}

async function fetchDevTo(): Promise<RawSignal[]> {
  const endpoints = [
    'https://dev.to/api/articles?top=7&per_page=8',
    'https://dev.to/api/articles?tag=security&top=14&per_page=4',
    'https://dev.to/api/articles?tag=dotnet&top=14&per_page=4',
  ];
  const results: RawSignal[] = [];
  await Promise.all(
    endpoints.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) return;
        const articles = (await res.json()) as Array<{
          title: string;
          url: string;
          description: string;
          positive_reactions_count: number;
          tag_list?: string[];
        }>;
        for (const a of articles) {
          results.push({
            title: a.title,
            url: a.url,
            source: 'DEV.to',
            metric: `♥ ${a.positive_reactions_count}`,
            description: a.description || a.title,
          });
        }
      } catch {
        // ignore partial
      }
    }),
  );
  return results;
}

async function curateWithAi(signals: RawSignal[], today: string): Promise<TechRadarItem[]> {
  // Deduplicate by URL
  const uniqueMap = new Map<string, RawSignal>();
  for (const s of signals) {
    if (!uniqueMap.has(s.url)) uniqueMap.set(s.url, s);
  }
  const unique = [...uniqueMap.values()].slice(0, 35);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || unique.length === 0) {
    return unique.slice(0, 12).map((s) => ({
      id: crypto.createHash('md5').update(s.url).digest('hex').slice(0, 12),
      title: s.title,
      url: s.url,
      source: s.source,
      category: s.source === 'GitHub' ? 'GitHub Repos' : 'Dev Tools',
      metric: s.metric,
      tldr: s.description.slice(0, 160),
      howToUse: `Worth reviewing from ${s.source} to stay current on modern engineering tools.`,
      saved: false,
      fetchedDate: today,
    }));
  }

  try {
    const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You curate a calm, high-signal daily Tech Radar for a software & security-conscious C#/.NET/Automation engineer who wants to stay connected to the wider tech world (dev tools, GitHub repos, AI, security, .NET).
Pick the best 14 items from the raw feed (skip fluff, politics, or low-value clickbait).
For each item choose ONE category strictly from: ${RADAR_CATEGORIES.join(', ')}.
Write:
- tldr: 1 crisp sentence explaining what this is / what happened.
- howToUse: 1 practical sentence explaining how developers can use or integrate this tool/insight (especially in engineering/automation/security).
Return strict JSON: { "items": [ { "index": 0, "category": "...", "tldr": "...", "howToUse": "..." } ] }`,
          },
          {
            role: 'user',
            content: JSON.stringify(
              unique.map((u, index) => ({
                index,
                source: u.source,
                title: u.title,
                metric: u.metric,
                description: u.description.slice(0, 180),
              })),
            ),
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI radar failed (${res.status})`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty radar AI payload');

    const parsed = JSON.parse(raw) as {
      items?: Array<{ index: number; category: string; tldr: string; howToUse: string }>;
    };
    const allowed = new Set<string>(RADAR_CATEGORIES);
    const curated: TechRadarItem[] = [];

    for (const pick of parsed.items ?? []) {
      const orig = unique[pick.index];
      if (!orig) continue;
      const cat: RadarCategory = allowed.has(pick.category)
        ? (pick.category as RadarCategory)
        : orig.source === 'GitHub'
        ? 'GitHub Repos'
        : 'Dev Tools';

      curated.push({
        id: crypto.createHash('md5').update(orig.url).digest('hex').slice(0, 12),
        title: orig.title,
        url: orig.url,
        source: orig.source,
        category: cat,
        metric: orig.metric,
        tldr: String(pick.tldr || orig.description).slice(0, 220),
        howToUse: String(pick.howToUse || 'Explore this tool/pattern for your engineering toolkit.').slice(0, 240),
        saved: false,
        fetchedDate: today,
      });
    }

    if (curated.length > 0) return curated;
  } catch (err) {
    console.warn('[techRadar] AI curation fallback:', err);
  }

  return unique.slice(0, 12).map((s) => ({
    id: crypto.createHash('md5').update(s.url).digest('hex').slice(0, 12),
    title: s.title,
    url: s.url,
    source: s.source,
    category: s.source === 'GitHub' ? 'GitHub Repos' : 'Dev Tools',
    metric: s.metric,
    tldr: s.description.slice(0, 160),
    howToUse: `Check out this ${s.source} trend to see how other teams are adopting it.`,
    saved: false,
    fetchedDate: today,
  }));
}

export async function refreshTechRadar(): Promise<{ items: TechRadarItem[]; fetchedDate: string }> {
  await ensureTables();
  const today = istToday();
  const db = await getSchedulerDb();

  const [hn, gh, dev] = await Promise.all([
    fetchHackerNews(),
    fetchGithubHot(),
    fetchDevTo(),
  ]);

  const curated = await curateWithAi([...gh, ...hn, ...dev], today);
  const now = new Date().toISOString();

  // Keep saved items; replace non-saved items from previous days
  await db.prepare('DELETE FROM tech_radar_items WHERE saved = 0').run();

  const stmt = db.prepare(`
    INSERT INTO tech_radar_items (
      id, title, url, source, category, metric, tldr, how_to_use, saved, fetched_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      metric = excluded.metric,
      tldr = excluded.tldr,
      how_to_use = excluded.how_to_use,
      fetched_date = excluded.fetched_date
  `);

  for (const item of curated) {
    await stmt.run(
      item.id,
      item.title,
      item.url,
      item.source,
      item.category,
      item.metric,
      item.tldr,
      item.howToUse,
      today,
      now,
    );
  }

  return getTechRadar(false);
}

export async function getTechRadar(autoFetchIfStale = true): Promise<{ items: TechRadarItem[]; fetchedDate: string }> {
  await ensureTables();
  const today = istToday();
  const db = await getSchedulerDb();

  const rows = await db
    .prepare(`
      SELECT id, title, url, source, category, metric, tldr, how_to_use AS howToUse,
             saved, fetched_date AS fetchedDate
      FROM tech_radar_items
      ORDER BY fetched_date DESC, saved DESC, created_at DESC
    `)
    .all<Omit<TechRadarItem, 'saved'> & { saved: number }>();

  const hasToday = rows.some((r) => r.fetchedDate === today);
  if (autoFetchIfStale && !hasToday) {
    return refreshTechRadar();
  }

  return {
    items: rows.map((r) => ({ ...r, saved: r.saved === 1 })),
    fetchedDate: rows[0]?.fetchedDate ?? today,
  };
}

export async function toggleSaveRadarItem(id: string): Promise<TechRadarItem | null> {
  await ensureTables();
  const db = await getSchedulerDb();
  await db
    .prepare('UPDATE tech_radar_items SET saved = CASE WHEN saved = 1 THEN 0 ELSE 1 END WHERE id = ?')
    .run(id);
  const row = await db
    .prepare(`
      SELECT id, title, url, source, category, metric, tldr, how_to_use AS howToUse,
             saved, fetched_date AS fetchedDate
      FROM tech_radar_items
      WHERE id = ?
    `)
    .get<Omit<TechRadarItem, 'saved'> & { saved: number }>(id);
  return row ? { ...row, saved: row.saved === 1 } : null;
}
