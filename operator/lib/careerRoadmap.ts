import crypto from 'crypto';
import { getSchedulerDb } from '@/lib/scheduler/db';
import { saveCareerData } from './careerData';

export interface CareerTaskItem {
  id: string;
  title: string;
  criteria: string;
  progressPct: number;
  done: boolean;
  lastNote?: string;
}

export interface CareerStage {
  id: string;
  order: number;
  title: string;
  focus: string;
  progressPct: number;
  tasks: CareerTaskItem[];
}

export interface CareerLogEntry {
  id: string;
  logDate: string;
  stageId: string;
  taskId: string;
  taskTitle: string;
  description: string;
  scorePct: number;
  feedback: string;
  createdAt: string;
}

export interface CareerRoadmapSnapshot {
  goalTitle: string;
  overallProgressPct: number;
  activeStageId: string;
  stages: CareerStage[];
  logs: CareerLogEntry[];
}

const DEFAULT_GOAL = 'C# / .NET & Automation Developer';

const STARTER_STAGES: CareerStage[] = [
  {
    id: 'stage-1',
    order: 1,
    title: 'C# Core & Modern .NET',
    focus: 'Language fluency, LINQ, async programming, and dependency injection',
    progressPct: 0,
    tasks: [
      {
        id: 's1-t1',
        title: 'OOP, Records, Interfaces & Generics',
        criteria: 'Explain what classes/records/interfaces you implemented and show clean polymorphic design.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's1-t2',
        title: 'LINQ & Collections Deep Practice',
        criteria: 'Solve real data filtering/grouping problems using Select, Where, GroupBy, Dictionary without nested loops.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's1-t3',
        title: 'Async/Await, Task.WhenAll & CancellationTokens',
        criteria: 'Implement async workflows properly without .Result blocking, handling CancellationToken and exceptions.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's1-t4',
        title: 'Dependency Injection & Logging',
        criteria: 'Wire Transient/Scoped/Singleton services with ILogger and structured config (IOptions).',
        progressPct: 0,
        done: false,
      },
    ],
  },
  {
    id: 'stage-2',
    order: 2,
    title: 'ASP.NET Core Web APIs & Data',
    focus: 'Production APIs, EF Core, validation, and authentication',
    progressPct: 0,
    tasks: [
      {
        id: 's2-t1',
        title: 'Build CRUD REST API (Minimal APIs / Controllers)',
        criteria: 'Endpoints return proper HTTP status codes, DTOs, and global error middleware.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's2-t2',
        title: 'Entity Framework Core + Migrations',
        criteria: 'Model 1-to-many relations, run migrations, and optimize queries with AsNoTracking/indexes.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's2-t3',
        title: 'Validation, JWT Auth & Swagger/OpenAPI',
        criteria: 'Protect endpoints with JWT auth + FluentValidation or DataAnnotations.',
        progressPct: 0,
        done: false,
      },
    ],
  },
  {
    id: 'stage-3',
    order: 3,
    title: 'Automation Engineering & Testing',
    focus: 'Playwright for .NET, API automation, xUnit tests, and background jobs',
    progressPct: 0,
    tasks: [
      {
        id: 's3-t1',
        title: 'Unit & Integration Testing with xUnit + Moq',
        criteria: 'Write tests covering happy paths, edge cases, and WebApplicationFactory integration tests.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's3-t2',
        title: 'Browser Automation with Playwright (.NET)',
        criteria: 'Build reliable Page Object Model tests with auto-waiting, assertions, and trace capture.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's3-t3',
        title: 'API Automation Suite (HttpClient / RestSharp)',
        criteria: 'Automate end-to-end API contract verification with auth token reuse and assertions.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's3-t4',
        title: 'Background Workers (IHostedService / Hangfire)',
        criteria: 'Schedule repeatable automation jobs with retry safety and structured logs.',
        progressPct: 0,
        done: false,
      },
    ],
  },
  {
    id: 'stage-4',
    order: 4,
    title: 'CI/CD, Docker & Production Readiness',
    focus: 'Shipping automated pipelines and containerized .NET apps',
    progressPct: 0,
    tasks: [
      {
        id: 's4-t1',
        title: 'Dockerize .NET API + Database',
        criteria: 'Multi-stage Dockerfile and docker-compose running cleanly with health checks.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's4-t2',
        title: 'GitHub Actions CI Pipeline for Build + Playwright',
        criteria: 'Automated workflow running build, xUnit tests, and headless Playwright tests on push.',
        progressPct: 0,
        done: false,
      },
    ],
  },
  {
    id: 'stage-5',
    order: 5,
    title: 'Capstone Project & Job Interviews',
    focus: 'Portfolio proof and interview readiness',
    progressPct: 0,
    tasks: [
      {
        id: 's5-t1',
        title: 'Ship Capstone: .NET API + Automation Runner + README',
        criteria: 'Public GitHub repo with architecture diagram, clean CI badge, and automated tests.',
        progressPct: 0,
        done: false,
      },
      {
        id: 's5-t2',
        title: '.NET Internals & Automation Interview Prep',
        criteria: 'Practice CLR/GC, ThreadPool, middleware pipeline, SQL indexing, and flaky-test debugging answers.',
        progressPct: 0,
        done: false,
      },
    ],
  },
];

let initialized: Promise<void> | null = null;

async function ensureTables(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getSchedulerDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS career_roadmaps (
        id TEXT PRIMARY KEY,
        goal_title TEXT NOT NULL,
        raw_source TEXT,
        stages_json TEXT NOT NULL,
        active_stage_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS career_daily_logs (
        id TEXT PRIMARY KEY,
        log_date TEXT NOT NULL,
        stage_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_title TEXT NOT NULL,
        description TEXT NOT NULL,
        score_pct INTEGER NOT NULL,
        feedback TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_career_logs_created
        ON career_daily_logs(created_at DESC);
    `);

    const now = new Date().toISOString();
    await db
      .prepare(`
        INSERT OR IGNORE INTO career_roadmaps (
          id, goal_title, raw_source, stages_json, active_stage_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        'default-user',
        DEFAULT_GOAL,
        null,
        JSON.stringify(STARTER_STAGES),
        STARTER_STAGES[0].id,
        now,
        now,
      );
  })();
  return initialized;
}

function recomputeStages(stages: CareerStage[]): { stages: CareerStage[]; overallProgressPct: number } {
  const updated = stages.map((stage) => {
    const total = stage.tasks.reduce((sum, t) => sum + (t.progressPct || 0), 0);
    const pct = stage.tasks.length > 0 ? Math.round(total / stage.tasks.length) : 0;
    return { ...stage, progressPct: pct };
  });
  const overall =
    updated.length > 0
      ? Math.round(updated.reduce((sum, s) => sum + s.progressPct, 0) / updated.length)
      : 0;
  return { stages: updated, overallProgressPct: overall };
}

async function syncCareerProfileSummary(
  goalTitle: string,
  stages: CareerStage[],
  activeStageId: string,
): Promise<void> {
  const activeStage = stages.find((s) => s.id === activeStageId) ?? stages[0];
  if (!activeStage) return;
  const nextTask = activeStage.tasks.find((t) => !t.done) ?? activeStage.tasks[0];
  await saveCareerData({
    targetRole: goalTitle,
    currentPhase: `Stage ${activeStage.order} — ${activeStage.title} (${activeStage.progressPct}%)`,
    currentMilestone: nextTask ? nextTask.title : activeStage.focus,
  });
}

export async function getCareerRoadmap(): Promise<CareerRoadmapSnapshot> {
  await ensureTables();
  const db = await getSchedulerDb();
  const row = await db
    .prepare(`
      SELECT goal_title AS goalTitle, stages_json AS stagesJson, active_stage_id AS activeStageId
      FROM career_roadmaps
      WHERE id = ?
    `)
    .get<{ goalTitle: string; stagesJson: string; activeStageId: string }>('default-user');

  const rawStages = row ? (JSON.parse(row.stagesJson) as CareerStage[]) : STARTER_STAGES;
  const { stages, overallProgressPct } = recomputeStages(rawStages);
  const activeStageId =
    stages.find((s) => s.id === row?.activeStageId)?.id ?? stages[0]?.id ?? 'stage-1';

  const logs = await db
    .prepare(`
      SELECT id, log_date AS logDate, stage_id AS stageId, task_id AS taskId,
             task_title AS taskTitle, description, score_pct AS scorePct,
             feedback, created_at AS createdAt
      FROM career_daily_logs
      ORDER BY created_at DESC
      LIMIT 30
    `)
    .all<CareerLogEntry>();

  return {
    goalTitle: row?.goalTitle ?? DEFAULT_GOAL,
    overallProgressPct,
    activeStageId,
    stages,
    logs,
  };
}

async function persistRoadmap(
  goalTitle: string,
  stages: CareerStage[],
  activeStageId: string,
  rawSource?: string | null,
): Promise<CareerRoadmapSnapshot> {
  const db = await getSchedulerDb();
  const now = new Date().toISOString();
  if (rawSource !== undefined) {
    await db
      .prepare(`
        UPDATE career_roadmaps
        SET goal_title = ?, raw_source = ?, stages_json = ?, active_stage_id = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(goalTitle, rawSource, JSON.stringify(stages), activeStageId, now, 'default-user');
  } else {
    await db
      .prepare(`
        UPDATE career_roadmaps
        SET goal_title = ?, stages_json = ?, active_stage_id = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(goalTitle, JSON.stringify(stages), activeStageId, now, 'default-user');
  }
  await syncCareerProfileSummary(goalTitle, stages, activeStageId);
  return getCareerRoadmap();
}

export async function setActiveCareerStage(stageId: string): Promise<CareerRoadmapSnapshot> {
  const snap = await getCareerRoadmap();
  const target = snap.stages.find((s) => s.id === stageId);
  if (!target) throw new Error('Stage not found.');
  return persistRoadmap(snap.goalTitle, snap.stages, target.id);
}

export async function addCareerTask(input: {
  stageId?: string;
  title: string;
  criteria?: string;
}): Promise<CareerRoadmapSnapshot> {
  const snap = await getCareerRoadmap();
  const title = input.title.trim().slice(0, 140);
  if (!title) throw new Error('Task title is required.');

  const targetStageId = input.stageId || snap.activeStageId;
  const nextStages = snap.stages.map((s) =>
    s.id === targetStageId
      ? {
          ...s,
          tasks: [
            ...s.tasks,
            {
              id: crypto.randomUUID().slice(0, 8),
              title,
              criteria:
                input.criteria?.trim() ||
                'Describe what you built, tested, or verified with concrete details.',
              progressPct: 0,
              done: false,
            },
          ],
        }
      : s,
  );

  const { stages } = recomputeStages(nextStages);
  return persistRoadmap(snap.goalTitle, stages, snap.activeStageId);
}

export async function evaluateAndLogCareerWork(input: {
  stageId: string;
  taskId: string;
  description: string;
}): Promise<{ snapshot: CareerRoadmapSnapshot; evaluation: { scorePct: number; feedback: string; done: boolean } }> {
  const description = input.description.trim();
  if (description.length < 10) {
    throw new Error('Describe what you actually did or built today (at least 10 characters).');
  }

  const snap = await getCareerRoadmap();
  const stage = snap.stages.find((s) => s.id === input.stageId);
  const task = stage?.tasks.find((t) => t.id === input.taskId);
  if (!stage || !task) {
    throw new Error('Stage or task not found.');
  }

  let scorePct = Math.min(100, Math.max(task.progressPct, description.length >= 80 ? 85 : 50));
  let feedback = 'Logged! Add unit tests or a working code example to lock in 100%.';

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a strict Senior C#/.NET & Automation Tech Lead grading a learner's daily proof-of-work log.
Rules:
- Be fair but strict. Vague statements ("watched video", "read docs", "did task") score 20-45% and are NOT done.
- Concrete work (built endpoints, wrote tests, handled edge cases, solved concrete scenarios) scores 75-100%.
- Task is marked done ONLY if scorePct >= 85.
- If previousProgressPct > 0, evaluate total cumulative completeness (usually >= previousProgressPct unless irrelevant).
Return strictly JSON: { "scorePct": 0-100, "feedback": "1-2 direct sentences: what's good + what concrete thing is missing (if < 85)" }.`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                goal: snap.goalTitle,
                stage: stage.title,
                taskTitle: task.title,
                completionCriteria: task.criteria,
                previousProgressPct: task.progressPct,
                previousNote: task.lastNote ?? null,
                todaysDescription: description,
              }),
            },
          ],
        }),
      });

      if (res.ok) {
        const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = payload.choices?.[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw) as { scorePct?: number; feedback?: string };
          if (typeof parsed.scorePct === 'number') {
            scorePct = Math.max(task.progressPct, Math.min(100, Math.round(parsed.scorePct)));
          }
          if (typeof parsed.feedback === 'string' && parsed.feedback.trim()) {
            feedback = parsed.feedback.trim();
          }
        }
      }
    } catch (err) {
      console.warn('[careerRoadmap] AI grading fallback:', err);
    }
  }

  const done = scorePct >= 85;
  const nextStagesRaw = snap.stages.map((s) =>
    s.id !== stage.id
      ? s
      : {
          ...s,
          tasks: s.tasks.map((t) =>
            t.id !== task.id
              ? t
              : {
                  ...t,
                  progressPct: scorePct,
                  done,
                  lastNote: description.slice(0, 300),
                },
          ),
        },
  );

  const { stages } = recomputeStages(nextStagesRaw);

  // Auto-advance active stage if all tasks in current active stage are done
  let nextActiveStageId = snap.activeStageId;
  const updatedCurrent = stages.find((s) => s.id === snap.activeStageId);
  if (updatedCurrent && updatedCurrent.tasks.length > 0 && updatedCurrent.tasks.every((t) => t.done)) {
    const nextStage = stages.find((s) => s.order > updatedCurrent.order && !s.tasks.every((t) => t.done));
    if (nextStage) nextActiveStageId = nextStage.id;
  }

  const db = await getSchedulerDb();
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  await db
    .prepare(`
      INSERT INTO career_daily_logs (
        id, log_date, stage_id, task_id, task_title, description, score_pct, feedback, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      crypto.randomUUID(),
      todayIst,
      stage.id,
      task.id,
      task.title,
      description,
      scorePct,
      feedback,
      new Date().toISOString(),
    );

  const snapshot = await persistRoadmap(snap.goalTitle, stages, nextActiveStageId);
  return { snapshot, evaluation: { scorePct, feedback, done } };
}

export async function importCareerRoadmap(input: {
  goalTitle?: string;
  rawText: string;
}): Promise<CareerRoadmapSnapshot> {
  const rawText = input.rawText.trim();
  if (rawText.length < 30) {
    throw new Error('Roadmap text is too short to parse.');
  }

  const goalTitle = input.goalTitle?.trim() || DEFAULT_GOAL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to parse uploaded roadmaps.');
  }

  const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Parse the user's career/learning roadmap into clear sequential Stages (3 to 7 stages) and concrete daily/milestone Tasks (2 to 6 tasks per stage).
Return strict JSON:
{
  "goalTitle": "...",
  "stages": [
    {
      "title": "...",
      "focus": "one sentence focus",
      "tasks": [
        { "title": "concrete task", "criteria": "what proof/code completes this task" }
      ]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            targetRole: goalTitle,
            roadmapContent: rawText.slice(0, 16_000),
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to parse roadmap (${res.status}).`);
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty roadmap parser response.');

  const parsed = JSON.parse(raw) as {
    goalTitle?: string;
    stages?: Array<{
      title: string;
      focus?: string;
      tasks: Array<{ title: string; criteria?: string }>;
    }>;
  };

  if (!Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    throw new Error('Could not extract stages from the provided roadmap.');
  }

  const stages: CareerStage[] = parsed.stages.map((s, idx) => ({
    id: `stage-${idx + 1}`,
    order: idx + 1,
    title: String(s.title || `Stage ${idx + 1}`).slice(0, 80),
    focus: String(s.focus || '').slice(0, 160),
    progressPct: 0,
    tasks: (s.tasks || []).slice(0, 10).map((t, tIdx) => ({
      id: `s${idx + 1}-t${tIdx + 1}`,
      title: String(t.title || `Task ${tIdx + 1}`).slice(0, 140),
      criteria: String(t.criteria || 'Describe what you built and tested to pass.').slice(0, 220),
      progressPct: 0,
      done: false,
    })),
  }));

  await ensureTables();
  return persistRoadmap(
    parsed.goalTitle?.trim() || goalTitle,
    stages,
    stages[0].id,
    rawText.slice(0, 20_000),
  );
}
