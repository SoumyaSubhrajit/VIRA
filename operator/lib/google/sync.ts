import type { OAuth2Client } from 'google-auth-library';
import { getTasksForDate } from '@/lib/scheduler/db';
import { PERSONALITY_BY_ID } from '@/lib/scheduler/personalities';
import type { SchedulerTask } from '@/lib/scheduler/types';
import { getAuthorizedGoogleClient } from './auth';
import { deleteGoogleTaskLink, getGoogleTaskLink, saveGoogleTaskLink } from './db';
import type { GoogleAgendaSnapshot, GoogleSyncResult, GoogleTaskLink } from './types';

interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
  reminders?: { useDefault: boolean; overrides: Array<{ method: string; minutes: number }> };
}

interface GoogleTaskResource {
  id?: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
  completed?: string;
  webViewLink?: string;
}

function endTimestamp(task: SchedulerTask): string {
  const start = new Date(task.scheduledAt).getTime();
  if (!task.endTime) return new Date(start + 60 * 60_000).toISOString();
  const [startHour, startMinute] = task.startTime.split(':').map(Number);
  const [endHour, endMinute] = task.endTime.split(':').map(Number);
  const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  return new Date(start + Math.max(durationMinutes, 1) * 60_000).toISOString();
}

function googleError(error: unknown): { status: number | null; message: string } {
  const candidate = error as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  return {
    status: candidate.response?.status ?? null,
    message: candidate.response?.data?.error?.message ?? candidate.message ?? 'Unknown Google API error.',
  };
}

function calendarEvent(task: SchedulerTask): CalendarEvent {
  const personality = PERSONALITY_BY_ID[task.personalityId];
  return {
    summary: `[VIRA / ${personality.shortName}] ${task.title}`,
    description: [
      personality.identityStatement,
      task.details,
      `Priority: P${task.priority}`,
      `VIRA-ID: ${task.id}`,
    ].filter(Boolean).join('\n\n'),
    start: { dateTime: task.scheduledAt, timeZone: 'Asia/Kolkata' },
    end: { dateTime: endTimestamp(task), timeZone: 'Asia/Kolkata' },
    status: task.status === 'skipped' ? 'cancelled' : 'confirmed',
    extendedProperties: { private: { viraTaskId: task.id, viraPersonality: task.personalityId } },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: Math.max(task.reminderMinutes, 0) }],
    },
  };
}

function googleTask(task: SchedulerTask): GoogleTaskResource {
  const personality = PERSONALITY_BY_ID[task.personalityId];
  const skipped = task.status === 'skipped';
  const resource: GoogleTaskResource = {
    title: `${skipped ? '[SKIPPED] ' : ''}[${personality.shortName}] ${task.title}`,
    notes: [
      `${task.startTime}${task.endTime ? `–${task.endTime}` : ''} · P${task.priority}`,
      personality.identityStatement,
      task.details,
      `VIRA-ID: ${task.id}`,
    ].filter(Boolean).join('\n\n'),
    due: `${task.taskDate}T00:00:00.000Z`,
    status: task.status === 'completed' ? 'completed' : 'needsAction',
  };
  if (task.status === 'completed') resource.completed = task.completedAt ?? new Date().toISOString();
  return resource;
}

function calendarEventUrl(calendarId: string, eventId?: string): string {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

function googleTaskUrl(taskListId: string, taskId?: string): string {
  const base = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`;
  return taskId ? `${base}/${encodeURIComponent(taskId)}` : base;
}

async function upsertCalendarTask(
  task: SchedulerTask,
  client: OAuth2Client,
  calendarId: string,
  link: GoogleTaskLink
): Promise<string> {
  if (link.calendarEventId) {
    try {
      const response = await client.request<CalendarEvent>({
        url: calendarEventUrl(calendarId, link.calendarEventId),
        method: 'PATCH',
        data: calendarEvent(task),
      });
      if (!response.data.id) throw new Error('Google Calendar did not return an event ID.');
      return response.data.id;
    } catch (error) {
      const status = googleError(error).status;
      if (status !== 404 && status !== 410) throw error;
    }
  }
  const response = await client.request<CalendarEvent>({
    url: calendarEventUrl(calendarId),
    method: 'POST',
    data: calendarEvent(task),
  });
  if (!response.data.id) throw new Error('Google Calendar did not return an event ID.');
  return response.data.id;
}

async function upsertGoogleTask(
  task: SchedulerTask,
  client: OAuth2Client,
  taskListId: string,
  link: GoogleTaskLink
): Promise<string> {
  if (link.googleTaskId) {
    try {
      const response = await client.request<GoogleTaskResource>({
        url: googleTaskUrl(taskListId, link.googleTaskId),
        method: 'PATCH',
        data: googleTask(task),
      });
      if (!response.data.id) throw new Error('Google Tasks did not return a task ID.');
      return response.data.id;
    } catch (error) {
      const status = googleError(error).status;
      if (status !== 404 && status !== 410) throw error;
    }
  }
  const response = await client.request<GoogleTaskResource>({
    url: googleTaskUrl(taskListId),
    method: 'POST',
    data: googleTask(task),
  });
  if (!response.data.id) throw new Error('Google Tasks did not return a task ID.');
  return response.data.id;
}

export async function syncTaskToGoogle(task: SchedulerTask): Promise<GoogleSyncResult> {
  let authorized: ReturnType<typeof getAuthorizedGoogleClient>;
  try {
    authorized = getAuthorizedGoogleClient();
  } catch (error) {
    return { calendar: 'failed', tasks: 'failed', error: googleError(error).message };
  }
  if (!authorized) return { calendar: 'disabled', tasks: 'disabled' };

  const { client, connection } = authorized;
  const link = getGoogleTaskLink(task.id) ?? {
    localTaskId: task.id,
    calendarEventId: null,
    googleTaskId: null,
    syncedAt: null,
    syncError: null,
  };
  const errors: string[] = [];
  let calendarStatus: GoogleSyncResult['calendar'] = connection.calendarSyncEnabled ? 'failed' : 'disabled';
  let tasksStatus: GoogleSyncResult['tasks'] = connection.tasksSyncEnabled ? 'failed' : 'disabled';

  if (connection.calendarSyncEnabled) {
    try {
      link.calendarEventId = await upsertCalendarTask(task, client, connection.calendarId, link);
      calendarStatus = 'synced';
    } catch (error) {
      errors.push(`Calendar: ${googleError(error).message}`);
    }
  }

  if (connection.tasksSyncEnabled) {
    try {
      link.googleTaskId = await upsertGoogleTask(task, client, connection.taskListId, link);
      tasksStatus = 'synced';
    } catch (error) {
      errors.push(`Tasks: ${googleError(error).message}`);
    }
  }

  link.syncedAt = errors.length === 0 ? new Date().toISOString() : link.syncedAt;
  link.syncError = errors.length ? errors.join(' | ') : null;
  saveGoogleTaskLink(link);
  return { calendar: calendarStatus, tasks: tasksStatus, ...(errors.length ? { error: errors.join(' | ') } : {}) };
}

export async function deleteTaskFromGoogle(localTaskId: string): Promise<void> {
  const link = getGoogleTaskLink(localTaskId);
  if (!link) return;
  const authorized = getAuthorizedGoogleClient();
  if (authorized) {
    const { client, connection } = authorized;
    if (link.calendarEventId) {
      try {
        await client.request({
          url: calendarEventUrl(connection.calendarId, link.calendarEventId),
          method: 'DELETE',
        });
      } catch (error) {
        const status = googleError(error).status;
        if (status !== 404 && status !== 410) throw error;
      }
    }
    if (link.googleTaskId) {
      try {
        await client.request({
          url: googleTaskUrl(connection.taskListId, link.googleTaskId),
          method: 'DELETE',
        });
      } catch (error) {
        const status = googleError(error).status;
        if (status !== 404 && status !== 410) throw error;
      }
    }
  }
  deleteGoogleTaskLink(localTaskId);
}

function nextDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export async function getGoogleAgenda(date: string): Promise<GoogleAgendaSnapshot> {
  const authorized = getAuthorizedGoogleClient();
  if (!authorized) throw new Error('Google account is not connected.');
  const { client, connection } = authorized;
  const eventParams = new URLSearchParams({
    timeMin: new Date(`${date}T00:00:00+05:30`).toISOString(),
    timeMax: new Date(`${nextDate(date)}T00:00:00+05:30`).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });

  const [eventResponse, taskResponse] = await Promise.all([
    client.request<{ items?: CalendarEvent[] }>({
      url: `${calendarEventUrl(connection.calendarId)}?${eventParams}`,
    }),
    client.request<{ items?: GoogleTaskResource[] }>({
      url: `${googleTaskUrl(connection.taskListId)}?showCompleted=true&showHidden=false&maxResults=100`,
    }),
  ]);

  return {
    date,
    events: (eventResponse.data.items ?? []).map((event) => ({
      id: event.id ?? '',
      title: event.summary ?? 'Untitled calendar event',
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      htmlLink: event.htmlLink ?? null,
      fromVira: Boolean(event.extendedProperties?.private?.viraTaskId),
    })),
    tasks: (taskResponse.data.items ?? [])
      .filter((task) => !task.due || task.due.slice(0, 10) === date)
      .map((task) => ({
        id: task.id ?? '',
        title: task.title ?? 'Untitled Google task',
        notes: task.notes ?? '',
        due: task.due ?? null,
        status: task.status === 'completed' ? 'completed' as const : 'needsAction' as const,
        webViewLink: task.webViewLink ?? null,
        fromVira: task.notes?.includes('VIRA-ID:') ?? false,
      })),
  };
}

export async function syncDateToGoogle(date: string): Promise<Array<{ taskId: string; result: GoogleSyncResult }>> {
  const results: Array<{ taskId: string; result: GoogleSyncResult }> = [];
  for (const task of getTasksForDate(date)) {
    results.push({ taskId: task.id, result: await syncTaskToGoogle(task) });
  }
  return results;
}
