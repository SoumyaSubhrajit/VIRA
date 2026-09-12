import { notionRequest, textContent } from './client';
import { getNotionLink, getNotionSettings, saveNotionLink, saveNotionWorkspace } from './store';

type CreatedDatabase = { id: string; data_sources?: Array<{ id: string }> };

export function extractNotionPageId(input: string): string {
  const decoded = decodeURIComponent(input.trim());
  const match = decoded.match(/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#/]|$)/i);
  if (!match) throw new Error('Enter a valid Notion page URL or page ID.');
  const raw = match[1].replace(/-/g, '');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

async function createDatabase(parentPageId: string, title: string, properties: Record<string, unknown>) {
  const created = await notionRequest<CreatedDatabase>('/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: parentPageId },
      title: textContent(title),
      is_inline: false,
      initial_data_source: { properties },
    },
  });
  let dataSourceId = created.data_sources?.[0]?.id;
  if (!dataSourceId) {
    const retrieved = await notionRequest<CreatedDatabase>(`/databases/${created.id}`);
    dataSourceId = retrieved.data_sources?.[0]?.id;
  }
  if (!dataSourceId) throw new Error(`Notion created “${title}” but did not return its data source ID.`);
  return { databaseId: created.id, dataSourceId };
}

const titleProperty = { type: 'title', title: {} };
const richTextProperty = { type: 'rich_text', rich_text: {} };
const dateProperty = { type: 'date', date: {} };
const numberProperty = { type: 'number', number: { format: 'number' } };
const selectProperty = (names: string[]) => ({ type: 'select', select: { options: names.map((name) => ({ name })) } });

const DEFAULT_PROJECTS = [
  { id: 'gym-os', name: 'Gym OS', area: 'Gym', objective: 'Build and sustain the 75 kg, 12–13% body-fat target with measurable training execution.' },
  { id: 'career-os', name: 'Career OS', area: 'Career', objective: 'Turn long-term ambition into shipped, measurable professional outcomes.' },
  { id: 'job-os', name: 'Job OS', area: 'Job', objective: 'Run daily employment responsibilities with professional delivery and evidence.' },
  { id: 'daily-command', name: 'Daily Command', area: 'Planning', objective: 'Plan, execute, verify, and close each day without losing unfinished work.' },
  { id: 'finance-os', name: 'Finance OS', area: 'Personal Finance', objective: 'Automatically classify, explain, and control personal cash flow.' },
  { id: 'family-finance-os', name: 'Family Finance OS', area: 'Family Finance', objective: 'Track shared obligations, transfers, and family financial commitments.' },
  { id: 'wellbeing-os', name: 'Wellbeing OS', area: 'Wellbeing', objective: 'Protect recovery, freedom, relationships, creativity, and sustainable performance.' },
] as const;

async function seedProjects(dataSourceId: string): Promise<void> {
  for (const project of DEFAULT_PROJECTS) {
    const properties = {
      Name: { title: textContent(project.name) },
      'VIRA ID': { rich_text: textContent(project.id) },
      Area: { select: { name: project.area } },
      Status: { select: { name: 'Active' } },
      Objective: { rich_text: textContent(project.objective) },
      'Target Date': { date: null },
      'Last Sync': { date: { start: new Date().toISOString() } },
    };
    const existingPageId = await getNotionLink('project', project.id);
    if (existingPageId) {
      await notionRequest(`/pages/${existingPageId}`, { method: 'PATCH', body: { properties, archived: false } });
      continue;
    }
    const page = await notionRequest<{ id: string }>('/pages', {
      method: 'POST',
      body: { parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties },
    });
    await saveNotionLink('project', project.id, page.id, 'bootstrap-v1');
  }
}

export async function bootstrapNotionWorkspace(parentInput: string) {
  const parentPageId = extractNotionPageId(parentInput);
  const existing = await getNotionSettings();
  if (existing.parentPageId && existing.parentPageId !== parentPageId && (existing.projectsDatabaseId || existing.workItemsDatabaseId || existing.dailyLogsDatabaseId)) {
    throw new Error('A different Notion workspace is already partially configured. Clear its saved IDs before changing the parent page.');
  }
  await saveNotionWorkspace({ parentPageId, lastError: null });

  const projects = existing.projectsDatabaseId && existing.projectsDataSourceId
    ? { databaseId: existing.projectsDatabaseId, dataSourceId: existing.projectsDataSourceId }
    : await createDatabase(parentPageId, 'VIRA — Projects', {
    Name: titleProperty,
    'VIRA ID': richTextProperty,
    Area: selectProperty(['Gym', 'Career', 'Job', 'Planning', 'Personal Finance', 'Family Finance', 'Wellbeing']),
    Status: selectProperty(['Active', 'Paused', 'Completed']),
    Objective: richTextProperty,
    'Target Date': dateProperty,
    'Last Sync': dateProperty,
  });
  await saveNotionWorkspace({ projectsDatabaseId: projects.databaseId, projectsDataSourceId: projects.dataSourceId });

  const workItems = existing.workItemsDatabaseId && existing.workItemsDataSourceId
    ? { databaseId: existing.workItemsDatabaseId, dataSourceId: existing.workItemsDataSourceId }
    : await createDatabase(parentPageId, 'VIRA — Work Items', {
    Name: titleProperty,
    'VIRA ID': richTextProperty,
    Project: selectProperty(['Gym OS', 'Career OS', 'Job OS', 'Daily Command', 'Finance OS', 'Family Finance OS', 'Wellbeing OS']),
    Area: selectProperty(['Gym', 'Career', 'Job', 'Planning', 'Personal Finance', 'Family Finance', 'Wellbeing']),
    Type: selectProperty(['Epic', 'Feature', 'Task', 'Bug', 'Routine']),
    Status: selectProperty(['Backlog', 'Ready', 'In Progress', 'Blocked', 'Review', 'Done']),
    Priority: selectProperty(['P0', 'P1', 'P2', 'P3']),
    Planned: dateProperty,
    Deadline: dateProperty,
    'Estimate Hours': numberProperty,
    'Actual Hours': numberProperty,
    'Definition of Done': richTextProperty,
    'Test Plan': richTextProperty,
    Evidence: richTextProperty,
    Blockers: richTextProperty,
    'Last Sync': dateProperty,
  });
  await saveNotionWorkspace({ workItemsDatabaseId: workItems.databaseId, workItemsDataSourceId: workItems.dataSourceId });

  const dailyLogs = existing.dailyLogsDatabaseId && existing.dailyLogsDataSourceId
    ? { databaseId: existing.dailyLogsDatabaseId, dataSourceId: existing.dailyLogsDataSourceId }
    : await createDatabase(parentPageId, 'VIRA — Daily Logs', {
    Name: titleProperty,
    'VIRA ID': richTextProperty,
    Date: dateProperty,
    Status: selectProperty(['Planned', 'In Progress', 'Closed']),
    Planned: numberProperty,
    Completed: numberProperty,
    'Focus Hours': numberProperty,
    Summary: richTextProperty,
    Wins: richTextProperty,
    Blockers: richTextProperty,
    'Carry Forward': numberProperty,
    'Last Sync': dateProperty,
  });
  await saveNotionWorkspace({ dailyLogsDatabaseId: dailyLogs.databaseId, dailyLogsDataSourceId: dailyLogs.dataSourceId });
  await seedProjects(projects.dataSourceId);

  const settings = await saveNotionWorkspace({
    enabled: true,
    parentPageId,
    projectsDatabaseId: projects.databaseId,
    projectsDataSourceId: projects.dataSourceId,
    workItemsDatabaseId: workItems.databaseId,
    workItemsDataSourceId: workItems.dataSourceId,
    dailyLogsDatabaseId: dailyLogs.databaseId,
    dailyLogsDataSourceId: dailyLogs.dataSourceId,
    lastError: null,
  });
  return settings;
}
