import { getSchedulerDb } from '@/lib/scheduler/db';
import type { CareerData, Skill } from './types';

const DEFAULT_CAREER: Omit<CareerData, 'isMock'> = {
  currentPhase: 'Phase 2 — Skill Consolidation',
  currentMilestone: 'Complete Full-Stack Portfolio Project',
  currentIncome: 30000,
  targetIncome: 6000000, // ₹60L/year -> ₹5L/month
  skills: [
    { name: 'Next.js / React', progress: 72 },
    { name: 'TypeScript', progress: 60 },
    { name: 'System Design', progress: 35 },
    { name: 'DSA / LeetCode', progress: 45 },
    { name: 'Node.js / APIs', progress: 68 },
  ],
  targetRole: 'Senior Full-Stack Engineer',
  weeklyFocus: null,
  updatedAt: null,
};

let initialized: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getSchedulerDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS career_profile (
        user_id TEXT PRIMARY KEY,
        current_phase TEXT NOT NULL,
        current_milestone TEXT NOT NULL,
        current_income INTEGER NOT NULL,
        target_income INTEGER NOT NULL,
        skills_json TEXT NOT NULL,
        target_role TEXT NOT NULL,
        weekly_focus TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    await db
      .prepare(`
        INSERT OR IGNORE INTO career_profile (
          user_id, current_phase, current_milestone, current_income, target_income,
          skills_json, target_role, weekly_focus, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        'default-user',
        DEFAULT_CAREER.currentPhase,
        DEFAULT_CAREER.currentMilestone,
        DEFAULT_CAREER.currentIncome,
        DEFAULT_CAREER.targetIncome,
        JSON.stringify(DEFAULT_CAREER.skills),
        DEFAULT_CAREER.targetRole,
        null,
        new Date().toISOString(),
      );
  })();
  return initialized;
}

export async function getCareerData(userId = 'default-user'): Promise<CareerData> {
  await ensureTable();
  const db = await getSchedulerDb();
  const row = await db
    .prepare(`
      SELECT current_phase AS currentPhase, current_milestone AS currentMilestone,
             current_income AS currentIncome, target_income AS targetIncome,
             skills_json AS skillsJson, target_role AS targetRole,
             weekly_focus AS weeklyFocus, updated_at AS updatedAt
      FROM career_profile
      WHERE user_id = ?
    `)
    .get<{
      currentPhase: string;
      currentMilestone: string;
      currentIncome: number;
      targetIncome: number;
      skillsJson: string;
      targetRole: string;
      weeklyFocus: string | null;
      updatedAt: string;
    }>(userId);

  if (!row) {
    return { ...DEFAULT_CAREER, isMock: false };
  }

  let skills: Skill[] = DEFAULT_CAREER.skills;
  try {
    skills = JSON.parse(row.skillsJson) as Skill[];
  } catch {
    // keep default
  }

  return {
    currentPhase: row.currentPhase,
    currentMilestone: row.currentMilestone,
    currentIncome: row.currentIncome,
    targetIncome: row.targetIncome,
    skills,
    targetRole: row.targetRole,
    weeklyFocus: row.weeklyFocus,
    updatedAt: row.updatedAt,
    isMock: false,
  };
}

export async function saveCareerData(
  input: Partial<Omit<CareerData, 'isMock'>>,
  userId = 'default-user',
): Promise<CareerData> {
  const existing = await getCareerData(userId);
  const next: Omit<CareerData, 'isMock'> = {
    currentPhase: input.currentPhase?.trim() || existing.currentPhase,
    currentMilestone: input.currentMilestone?.trim() || existing.currentMilestone,
    currentIncome:
      typeof input.currentIncome === 'number' && Number.isFinite(input.currentIncome)
        ? Math.max(0, Math.round(input.currentIncome))
        : existing.currentIncome,
    targetIncome:
      typeof input.targetIncome === 'number' && Number.isFinite(input.targetIncome)
        ? Math.max(0, Math.round(input.targetIncome))
        : existing.targetIncome,
    skills: Array.isArray(input.skills)
      ? input.skills
          .filter((s) => s && typeof s.name === 'string' && s.name.trim())
          .map((s) => ({
            name: s.name.trim().slice(0, 60),
            progress: Math.max(0, Math.min(100, Math.round(Number(s.progress) || 0))),
          }))
      : existing.skills,
    targetRole: input.targetRole?.trim() || existing.targetRole,
    weeklyFocus: input.weeklyFocus !== undefined ? input.weeklyFocus : existing.weeklyFocus,
    updatedAt: new Date().toISOString(),
  };

  const db = await getSchedulerDb();
  await db
    .prepare(`
      UPDATE career_profile
      SET current_phase = ?, current_milestone = ?, current_income = ?, target_income = ?,
          skills_json = ?, target_role = ?, weekly_focus = ?, updated_at = ?
      WHERE user_id = ?
    `)
    .run(
      next.currentPhase,
      next.currentMilestone,
      next.currentIncome,
      next.targetIncome,
      JSON.stringify(next.skills),
      next.targetRole,
      next.weeklyFocus ?? null,
      next.updatedAt,
      userId,
    );

  return { ...next, isMock: false };
}

export async function generateCareerWeeklyFocus(userId = 'default-user'): Promise<CareerData> {
  const career = await getCareerData(userId);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const lowestSkill = [...career.skills].sort((a, b) => a.progress - b.progress)[0];
    const fallback = lowestSkill
      ? `Spend 45 mins daily on ${lowestSkill.name} (${lowestSkill.progress}%) and ship one piece of "${career.currentMilestone}".`
      : `Make concrete daily progress on "${career.currentMilestone}".`;
    return saveCareerData({ weeklyFocus: fallback }, userId);
  }

  try {
    const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'You give concise 1-sentence weekly career execution plans tailored for someone with ADHD: super concrete, realistic, zero fluff.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              phase: career.currentPhase,
              milestone: career.currentMilestone,
              targetRole: career.targetRole,
              skills: career.skills,
            }),
          },
        ],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const focus = json.choices?.[0]?.message?.content?.trim();
      if (focus) {
        return saveCareerData({ weeklyFocus: focus }, userId);
      }
    }
  } catch (err) {
    console.warn('[careerData] AI focus fallback:', err);
  }
  return career;
}
