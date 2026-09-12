import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getFinanceHistoryTransactions, getFinanceMonthSummaries } from '@/lib/finance/db';
import { getAllSchedulerTasks, getSchedulerDb } from '@/lib/scheduler/db';
import type { SchedulerTask } from '@/lib/scheduler/types';
import { getObsidianSettings, recordObsidianSync, validateVaultPath } from './store';
import type { ObsidianSyncResult } from './types';

const START = '<!-- VIRA:START -->';
const END = '<!-- VIRA:END -->';
const PROJECTS = [
  ['Gym OS', 'Training, recovery, body composition, nutrition and performance.'],
  ['Career OS', 'Long-range career outcomes, skills and measurable advancement.'],
  ['Job OS', 'Professional execution, issues, deliverables and follow-through.'],
  ['Daily Command', 'Time-bound daily plans, reminders and execution review.'],
  ['Finance OS', 'Spending, income, budgets, categories and financial decisions.'],
  ['Family Finance OS', 'Shared obligations, support and family financial planning.'],
  ['Wellbeing OS', 'Mental health, recovery, relationships, creativity and freedom.'],
] as const;

function dateInKolkata(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function cleanFileName(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Untitled').slice(0, 90).replace(/[. ]+$/g, '');
}

function yaml(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
}

function projectForTask(task: SchedulerTask): string {
  const text = `${task.title} ${task.details}`.toLowerCase();
  if (/gym|workout|training|protein|weight|chest|back|shoulder|legs/.test(text)) return 'Gym OS';
  if (/family|mummy|mother|didi|home/.test(text)) return 'Family Finance OS';
  if (/money|finance|budget|spend|bank|payment|gpay/.test(text)) return 'Finance OS';
  if (/jira|office|job|ticket|meeting|client/.test(text)) return 'Job OS';
  if (/career|learn|skill|interview|course|goal/.test(text)) return 'Career OS';
  if (task.personalityId === 'free') return 'Wellbeing OS';
  return 'Daily Command';
}

function taskFile(task: SchedulerTask): string {
  return `02 Work Items/${task.taskDate} - ${cleanFileName(task.title)} - ${cleanFileName(task.id.slice(0, 12))}.md`;
}

function link(relativeFile: string): string {
  return `[[${relativeFile.replace(/\.md$/i, '')}]]`;
}

function assertInsideVault(vaultPath: string, relativeFile: string): string {
  const absolute = path.resolve(vaultPath, relativeFile);
  const prefix = `${path.resolve(vaultPath)}${path.sep}`.toLowerCase();
  if (!absolute.toLowerCase().startsWith(prefix)) throw new Error('Refusing to write outside the Obsidian vault.');
  return absolute;
}

function managedDocument(generated: string, existing: string | null): string {
  const managed = `${START}\n${generated.trim()}\n${END}`;
  if (!existing) {
    return `${managed}\n\n## Personal notes\n\nWrite freely here. VIRA preserves everything outside the managed block.\n`;
  }
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${managed}${existing.slice(end + END.length)}`;
  }
  return `${managed}\n\n## Previous note\n\n${existing}`;
}

function writeManaged(vaultPath: string, relativeFile: string, generated: string): boolean {
  const absolute = assertInsideVault(vaultPath, relativeFile);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  const next = managedDocument(generated, existing);
  if (existing === next) return false;
  const temp = `${absolute}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, next, 'utf8');
  fs.renameSync(temp, absolute);
  return true;
}

function taskNote(task: SchedulerTask): string {
  const project = projectForTask(task);
  const checked = task.status === 'completed' ? 'x' : ' ';
  return `---
vira_managed: true
vira_id: ${yaml(task.id)}
type: work-item
project: ${yaml(project)}
status: ${yaml(task.status)}
priority: ${task.priority}
planned_date: ${yaml(task.taskDate)}
start_time: ${yaml(task.startTime)}
end_time: ${yaml(task.endTime)}
personality: ${yaml(task.personalityId)}
updated_at: ${yaml(task.updatedAt)}
tags: [vira, work-item]
---

# ${task.title}

> [!summary] Execution contract
> ${task.details || 'No definition of done has been added yet.'}

- [${checked}] **Status:** ${task.status}
- **Project:** [[01 Projects/${project}]]
- **When:** ${task.taskDate}, ${task.startTime}${task.endTime ? `–${task.endTime}` : ''}
- **Priority:** P${task.priority}
- **Operating mode:** ${task.personalityId.replaceAll('_', ' ')}
- **Reminder:** ${task.reminderMinutes} minutes before via ${task.reminderChannel}

## Definition of done

${task.details || '- [ ] Define the result that proves this task is complete.'}
`;
}

function dailyLog(date: string, tasks: SchedulerTask[]): string {
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const skipped = tasks.filter((task) => task.status === 'skipped').length;
  const planned = tasks.filter((task) => task.status === 'planned').length;
  const agenda = tasks.length
    ? tasks.map((task) => `- [${task.status === 'completed' ? 'x' : ' '}] ${task.startTime} · ${link(taskFile(task))} · P${task.priority} · ${task.status}`).join('\n')
    : '- No timed work items recorded.';
  return `---
vira_managed: true
type: daily-log
date: ${yaml(date)}
completed: ${completed}
planned: ${planned}
skipped: ${skipped}
tags: [vira, daily]
---

# Daily Command — ${date}

> [!info] Execution score
> **${completed}/${tasks.length} completed** · ${planned} open · ${skipped} skipped

## Timeline

${agenda}

## End-of-day review

- What moved forward?
- What was avoided, and why?
- What is the single carry-forward priority?
`;
}

async function gymNote(date: string): Promise<string> {
  const database = await getSchedulerDb();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const profile = await database.prepare(`
    SELECT training_start_time AS trainingStartTime, session_minutes AS sessionMinutes,
      calorie_target AS calorieTarget, protein_target_g AS proteinTarget,
      water_target_l AS waterTarget, steps_target AS stepsTarget
    FROM gym_profiles WHERE user_id = 'default-user'
  `).get<{ trainingStartTime: string; sessionMinutes: number; calorieTarget: number; proteinTarget: number; waterTarget: number; stepsTarget: number }>();
  const template = await database.prepare(`
    SELECT t.id, t.name, t.focus
    FROM gym_workout_templates t
    LEFT JOIN gym_schedule_overrides o ON o.user_id = t.user_id AND o.schedule_date = ? AND o.template_id = t.id
    WHERE t.user_id = 'default-user' AND t.active = 1 AND (o.template_id IS NOT NULL OR (NOT EXISTS (
      SELECT 1 FROM gym_schedule_overrides x WHERE x.user_id = 'default-user' AND x.schedule_date = ?
    ) AND t.weekday = ?))
    ORDER BY CASE WHEN o.template_id IS NOT NULL THEN 0 ELSE 1 END LIMIT 1
  `).get<{ id: string; name: string; focus: string }>(date, date, weekday);
  const session = await database.prepare(`
    SELECT id, status, duration_minutes AS durationMinutes
    FROM gym_sessions WHERE user_id = 'default-user' AND session_date = ?
  `).get<{ id: string; status: string; durationMinutes: number | null }>(date);
  const check = await database.prepare(`
    SELECT weight_kg AS weightKg, sleep_hours AS sleepHours, pain, calories,
      protein_g AS proteinG, water_l AS waterL, steps
    FROM gym_daily_checkins WHERE user_id = 'default-user' AND checkin_date = ?
  `).get<{ weightKg: number | null; sleepHours: number | null; pain: number | null; calories: number | null; proteinG: number | null; waterL: number | null; steps: number | null }>(date);
  const exerciseRows = template ? await database.prepare(`
    SELECT name, target_sets AS targetSets, min_reps AS minReps, max_reps AS maxReps
    FROM gym_template_exercises WHERE template_id = ? ORDER BY exercise_order
  `).all<{ name: string; targetSets: number; minReps: number; maxReps: number }>(template.id) : [];
  const workingSets = session ? await database.prepare(`
    SELECT exercise_name AS exerciseName, weight_kg AS weightKg, reps
    FROM gym_set_logs WHERE session_id = ? AND warmup = 0 ORDER BY logged_at, set_number
  `).all<{ exerciseName: string; weightKg: number; reps: number }>(session.id) : [];
  const completedExercises = new Set(workingSets.map((set) => set.exerciseName)).size;
  const exercises = exerciseRows.length
    ? exerciseRows.map((exercise) => {
      const logged = workingSets.filter((set) => set.exerciseName === exercise.name);
      const result = logged.length ? ` — ${logged.map((set) => `${set.weightKg}kg×${set.reps}`).join(', ')}` : '';
      return `- [${logged.length >= exercise.targetSets ? 'x' : ' '}] **${exercise.name}** — ${exercise.targetSets}×${exercise.minReps}-${exercise.maxReps}${result}`;
    }).join('\n')
    : '- Recovery day. Mobility, measurements and sleep are the work.';
  return `---
vira_managed: true
type: gym-day
date: ${yaml(date)}
workout: ${yaml(template?.name ?? 'Unscheduled')}
session_status: ${yaml(session?.status ?? 'planned')}
working_sets: ${workingSets.length}
tags: [vira, gym]
---

# Gym OS — ${date}

> [!tip] Mission
> **${template?.name ?? 'Unscheduled'}** — ${template?.focus ?? 'Choose the session deliberately.'}

## Session

- **Start:** ${profile?.trainingStartTime ?? '21:00'}
- **Duration target:** ${profile?.sessionMinutes ?? 90} minutes
- **Progress:** ${completedExercises}/${exerciseRows.length} exercises · ${workingSets.length} working sets
- **Recorded duration:** ${session?.durationMinutes ?? '—'} minutes

## Exercise protocol

${exercises}

## Readiness and nutrition

- Weight: ${check?.weightKg ?? '—'} kg
- Sleep: ${check?.sleepHours ?? '—'} h
- Pain: ${check?.pain ?? '—'}/10
- Calories: ${check?.calories ?? '—'} / ${profile?.calorieTarget ?? 2180} kcal
- Protein: ${check?.proteinG ?? '—'} / ${profile?.proteinTarget ?? 165} g
- Water: ${check?.waterL ?? '—'} / ${profile?.waterTarget ?? 3.5} L
- Steps: ${check?.steps ?? '—'} / ${profile?.stepsTarget ?? 8000}
`;
}

async function financeNotes(vaultPath: string): Promise<{ files: number; months: number }> {
  const summaries = await getFinanceMonthSummaries();
  let files = 0;
  for (const summary of summaries) {
    const transactions = await getFinanceHistoryTransactions(summary.month);
    const categories = new Map<string, number>();
    for (const item of transactions) {
      if (item.direction === 'debit') categories.set(item.category, (categories.get(item.category) ?? 0) + item.amount);
    }
    const categoryLines = [...categories.entries()].sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => `- **${category}:** ${money(amount)}`).join('\n') || '- No spending recorded.';
    const transactionLines = transactions.map((item) => {
      const sign = item.direction === 'debit' ? '−' : '+';
      const purpose = item.purpose ? ` — ${item.purpose}` : '';
      return `- ${item.occurredAt.slice(0, 16).replace('T', ' ')} · **${item.merchant || 'Unknown'}** · ${item.category} · ${sign}${money(item.amount)}${purpose}`;
    }).join('\n') || '- No transactions recorded.';
    const note = `---
vira_managed: true
type: finance-month
month: ${yaml(summary.month)}
spent: ${summary.spent}
received: ${summary.received}
transaction_count: ${summary.transactionCount}
tags: [vira, finance]
---

# Finance OS — ${summary.month}

> [!summary] Cash flow
> **Spent:** ${money(summary.spent)} · **Received:** ${money(summary.received)} · **Net:** ${money(summary.received - summary.spent)}

## Category allocation

${categoryLines}

## Transactions

${transactionLines}
`;
    if (writeManaged(vaultPath, `05 Finance/${summary.month}.md`, note)) files += 1;
  }

  const index = `---
vira_managed: true
type: finance-index
tags: [vira, finance]
---

# Finance OS

${summaries.length ? summaries.map((item) => `- [[05 Finance/${item.month}]] — spent ${money(item.spent)}, received ${money(item.received)}, ${item.transactionCount} transactions`).join('\n') : 'No finance statements have been imported yet.'}
`;
  if (writeManaged(vaultPath, '05 Finance/Finance OS.md', index)) files += 1;
  return { files, months: summaries.length };
}

function templates(vaultPath: string): number {
  const notes: Array<[string, string]> = [
    ['99 System/Templates/Work Item.md', '# {{title}}\n\n## Outcome\n\n## Definition of done\n\n- [ ] Result verified\n\n## Notes'],
    ['99 System/Templates/Daily Log.md', '# {{date}}\n\n## Priorities\n\n- [ ] \n\n## Review\n\n- Win:\n- Avoidance:\n- Carry forward:'],
    ['99 System/Templates/Journal.md', '# {{date}}\n\n## What happened?\n\n## What did I feel?\n\n## What pattern do I notice?\n\n## What will I do next?'],
  ];
  return notes.reduce((count, [file, body]) => count + (writeManaged(vaultPath, file, body) ? 1 : 0), 0);
}

export async function syncObsidianVault(input: { vaultPath?: string; date?: string } = {}): Promise<ObsidianSyncResult> {
  const settings = await getObsidianSettings();
  const vaultPath = validateVaultPath(input.vaultPath ?? settings.vaultPath);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : dateInKolkata();
  const syncedAt = new Date().toISOString();
  let filesWritten = 0;

  try {
    fs.mkdirSync(vaultPath, { recursive: true });
    const tasks = await getAllSchedulerTasks();
    for (const task of tasks) {
      if (writeManaged(vaultPath, taskFile(task), taskNote(task))) filesWritten += 1;
    }

    const dates = new Set(tasks.map((task) => task.taskDate));
    dates.add(date);
    for (const taskDate of [...dates].sort().reverse()) {
      if (writeManaged(vaultPath, `03 Daily Logs/${taskDate}.md`, dailyLog(taskDate, tasks.filter((task) => task.taskDate === taskDate)))) filesWritten += 1;
    }

    for (const [name, purpose] of PROJECTS) {
      const projectTasks = tasks.filter((task) => projectForTask(task) === name);
      const body = `---\nvira_managed: true\ntype: project\nstatus: active\ntags: [vira, project]\n---\n\n# ${name}\n\n${purpose}\n\n## Open work\n\n${projectTasks.filter((task) => task.status === 'planned').map((task) => `- ${link(taskFile(task))}`).join('\n') || '- No open work items.'}`;
      if (writeManaged(vaultPath, `01 Projects/${name}.md`, body)) filesWritten += 1;
    }

    if (writeManaged(vaultPath, `04 Gym/${date}.md`, await gymNote(date))) filesWritten += 1;
    if (writeManaged(vaultPath, '04 Gym/Gym OS.md', `# Gym OS\n\n- **Today:** [[04 Gym/${date}]]\n- **Target:** 75 kg at 12–13% body fat\n- **Weekly rhythm:** six training days, Sunday measurement and recovery\n- **VIRA source:** SQLite workout sessions, sets, check-ins and measurements`)) filesWritten += 1;

    const finance = await financeNotes(vaultPath);
    filesWritten += finance.files;
    filesWritten += templates(vaultPath);

    const todayTasks = tasks.filter((task) => task.taskDate === date);
    const dashboard = `---
vira_managed: true
type: dashboard
updated_at: ${yaml(syncedAt)}
tags: [vira, dashboard]
---

# VIRA Command Center

> [!important] Today
> [[03 Daily Logs/${date}|Open today’s command log]] · [[04 Gym/${date}|Open today’s Gym OS]]

## Operating systems

${PROJECTS.map(([name]) => `- [[01 Projects/${name}]]`).join('\n')}

## Today’s execution

${todayTasks.length ? todayTasks.map((task) => `- [${task.status === 'completed' ? 'x' : ' '}] ${task.startTime} · ${link(taskFile(task))}`).join('\n') : '- No tasks are scheduled for today.'}

## System truth

- SQLite is the authoritative VIRA database.
- This vault is the readable thinking and planning layer.
- Text outside VIRA managed blocks is never overwritten.
- Last sync: ${syncedAt}
`;
    if (writeManaged(vaultPath, '00 Dashboard/VIRA Command Center.md', dashboard)) filesWritten += 1;
    if (writeManaged(vaultPath, 'README.md', '# VIRA Obsidian Vault\n\nOpen [[00 Dashboard/VIRA Command Center]] to begin. VIRA generates operational data inside managed blocks and preserves your personal writing outside them.')) filesWritten += 1;
    if (writeManaged(vaultPath, `06 Journal/${date}.md`, `---\ntype: journal\ndate: ${yaml(date)}\ntags: [vira, journal]\n---\n\n# Journal — ${date}\n\nUse this page for observations, memory and honest review.`)) filesWritten += 1;

    await recordObsidianSync(true, null);
    return {
      configured: true, vaultPath, filesWritten, tasksExported: tasks.length,
      dailyLogsExported: dates.size, financeMonthsExported: finance.months, syncedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Obsidian sync error.';
    await recordObsidianSync(false, message);
    throw error;
  }
}
