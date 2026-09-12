import crypto from 'crypto';
import { getSchedulerDb, getTask, getTasksForDate } from '@/lib/scheduler/db';
import type { SchedulerTask } from '@/lib/scheduler/types';
import { notionRequest, textContent } from './client';
import {
  claimDueNotionEvents,
  enqueueNotionEvent,
  getNotionLink,
  getNotionSettings,
  markNotionEventFailed,
  markNotionEventSent,
  saveNotionLink,
  saveNotionWorkspace,
} from './store';
import type { NotionEntityType, NotionOutboxEvent } from './types';

type NotionPage = { id: string };

function richText(value: string) { return { rich_text: textContent(value || '—') }; }
function title(value: string) { return { title: textContent(value || 'Untitled') }; }
function select(value: string) { return { select: { name: value } }; }
function date(value: string | null) { return { date: value ? { start: value } : null }; }
function number(value: number) { return { number: Number.isFinite(value) ? value : 0 }; }

function durationHours(task: SchedulerTask): number {
  const start = new Date(task.scheduledAt).getTime();
  const end = task.endAt ? new Date(task.endAt).getTime() : start + 60 * 60_000;
  return Math.max(0, Math.round(((end - start) / 3_600_000) * 100) / 100);
}

function workArea(task: SchedulerTask): { area: string; project: string } {
  if (task.personalityId === 'home') return { area: 'Family Finance', project: 'Family Finance OS' };
  if (task.personalityId === 'free') return { area: 'Wellbeing', project: 'Wellbeing OS' };
  return { area: 'Planning', project: 'Daily Command' };
}

function taskProperties(task: SchedulerTask) {
  const scope = workArea(task);
  const status = task.status === 'completed' ? 'Done' : task.status === 'skipped' ? 'Blocked' : 'Ready';
  const definition = task.details.trim() || `Complete “${task.title}” and record the result in VIRA.`;
  return {
    Name: title(task.title),
    'VIRA ID': richText(task.id),
    Project: select(scope.project),
    Area: select(scope.area),
    Type: select('Task'),
    Status: select(status),
    Priority: select(`P${task.priority}`),
    Planned: date(task.scheduledAt),
    Deadline: date(task.endAt),
    'Estimate Hours': number(durationHours(task)),
    'Actual Hours': number(task.status === 'completed' ? durationHours(task) : 0),
    'Definition of Done': richText(definition),
    'Test Plan': richText('Verify the intended outcome, record evidence, then mark Done in VIRA.'),
    Evidence: richText(task.status === 'completed' ? `Marked complete in VIRA at ${task.completedAt ?? task.updatedAt}.` : 'Pending'),
    Blockers: richText(task.status === 'skipped' ? 'Skipped in VIRA; review and reschedule.' : 'None recorded'),
    'Last Sync': date(new Date().toISOString()),
  };
}

function taskBlocks(task: SchedulerTask) {
  const details = task.details.trim() || 'Define the concrete deliverable before execution.';
  return [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: textContent('Objective') } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: textContent(details) } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: textContent('Execution contract') } },
    { object: 'block', type: 'to_do', to_do: { rich_text: textContent('Execute the work inside the planned window.'), checked: false } },
    { object: 'block', type: 'to_do', to_do: { rich_text: textContent('Verify the definition of done and capture evidence.'), checked: false } },
    { object: 'block', type: 'to_do', to_do: { rich_text: textContent('Mark the task complete in VIRA.'), checked: false } },
  ];
}

async function upsertPage(entityType: NotionEntityType, entityId: string, dataSourceId: string, properties: Record<string, unknown>, children?: unknown[]) {
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(properties)).digest('hex');
  const existing = await getNotionLink(entityType, entityId);
  if (existing) {
    await notionRequest<NotionPage>(`/pages/${existing}`, { method: 'PATCH', body: { properties, archived: false } });
    await saveNotionLink(entityType, entityId, existing, contentHash);
    return existing;
  }
  const created = await notionRequest<NotionPage>('/pages', {
    method: 'POST',
    body: { parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties, ...(children ? { children } : {}) },
  });
  await saveNotionLink(entityType, entityId, created.id, contentHash);
  return created.id;
}

async function syncTask(task: SchedulerTask): Promise<void> {
  const settings = await getNotionSettings();
  if (!settings.workItemsDataSourceId) throw new Error('Notion Work Items is not configured.');
  await upsertPage('scheduler_task', task.id, settings.workItemsDataSourceId, taskProperties(task), taskBlocks(task));
}

async function dailyLogProperties(dateKey: string) {
  const tasks = await getTasksForDate(dateKey);
  const completed = tasks.filter((task) => task.status === 'completed');
  const skipped = tasks.filter((task) => task.status === 'skipped');
  const status = tasks.length === 0 ? 'Planned' : completed.length + skipped.length === tasks.length ? 'Closed' : 'In Progress';
  const focusHours = completed.reduce((total, task) => total + durationHours(task), 0);
  return {
    Name: title(`Daily Command — ${dateKey}`),
    'VIRA ID': richText(`daily:${dateKey}`),
    Date: date(`${dateKey}T00:00:00+05:30`),
    Status: select(status),
    Planned: number(tasks.length),
    Completed: number(completed.length),
    'Focus Hours': number(Math.round(focusHours * 100) / 100),
    Summary: richText(tasks.length ? `${completed.length}/${tasks.length} planned objectives completed.` : 'No objectives planned.'),
    Wins: richText(completed.length ? completed.map((task) => task.title).join(' · ') : 'No completed work recorded yet.'),
    Blockers: richText(skipped.length ? skipped.map((task) => task.title).join(' · ') : 'None recorded'),
    'Carry Forward': number(tasks.filter((task) => task.status === 'planned').length),
    'Last Sync': date(new Date().toISOString()),
  };
}

async function syncDailyLog(dateKey: string): Promise<void> {
  const settings = await getNotionSettings();
  if (!settings.dailyLogsDataSourceId) throw new Error('Notion Daily Logs is not configured.');
  await upsertPage('daily_log', dateKey, settings.dailyLogsDataSourceId, await dailyLogProperties(dateKey));
}

async function processEvent(event: NotionOutboxEvent): Promise<void> {
  if (event.eventType === 'archive') {
    const pageId = await getNotionLink(event.entityType, event.entityId);
    if (pageId) await notionRequest(`/pages/${pageId}`, { method: 'PATCH', body: { archived: true } });
    return;
  }
  if (event.entityType === 'scheduler_task') {
    const task = await getTask(event.entityId);
    if (task) await syncTask(task);
    return;
  }
  await syncDailyLog(event.entityId);
}

export async function drainNotionOutbox(limit = 50) {
  const settings = await getNotionSettings();
  if (!settings.enabled || !settings.workItemsDataSourceId || !settings.dailyLogsDataSourceId) {
    return { configured: false, processed: 0, failed: 0 };
  }
  const events = await claimDueNotionEvents(limit);
  let processed = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const event of events) {
    try {
      await processEvent(event);
      await markNotionEventSent(event.id);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Notion sync error.';
      await markNotionEventFailed(event.id, event.attempts + 1, message);
      lastError = message;
      failed += 1;
    }
  }
  await saveNotionWorkspace({ lastSyncAt: new Date().toISOString(), lastError });
  return { configured: true, processed, failed, lastError };
}

export async function enqueueTaskSync(task: SchedulerTask): Promise<void> {
  await enqueueNotionEvent('scheduler_task', task.id, 'upsert', { taskDate: task.taskDate });
  await enqueueNotionEvent('daily_log', task.taskDate, 'upsert');
}

export async function enqueueTaskArchive(task: SchedulerTask): Promise<void> {
  await enqueueNotionEvent('scheduler_task', task.id, 'archive', { taskDate: task.taskDate });
  await enqueueNotionEvent('daily_log', task.taskDate, 'upsert');
}

export async function enqueueFullNotionSync(dateKey?: string): Promise<number> {
  const rows = dateKey
    ? await getTasksForDate(dateKey)
    : (await Promise.all((await (await getSchedulerDb()).prepare('SELECT task_date FROM scheduler_tasks GROUP BY task_date ORDER BY task_date').all<{ task_date: string }>()).map((row) => getTasksForDate(row.task_date)))).flat();
  const dates = new Set<string>();
  for (const task of rows) {
    await enqueueTaskSync(task);
    dates.add(task.taskDate);
  }
  if (dateKey && !dates.has(dateKey)) await enqueueNotionEvent('daily_log', dateKey, 'upsert');
  return rows.length;
}
