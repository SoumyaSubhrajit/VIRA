export type NotionEntityType = 'project' | 'scheduler_task' | 'daily_log';
export type NotionEventType = 'upsert' | 'archive';

export interface NotionSettings {
  userId: string;
  enabled: boolean;
  parentPageId: string | null;
  projectsDatabaseId: string | null;
  projectsDataSourceId: string | null;
  workItemsDatabaseId: string | null;
  workItemsDataSourceId: string | null;
  dailyLogsDatabaseId: string | null;
  dailyLogsDataSourceId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotionStatus {
  tokenPresent: boolean;
  configured: boolean;
  enabled: boolean;
  parentPageId: string | null;
  projectsDataSourceId: string | null;
  workItemsDataSourceId: string | null;
  dailyLogsDataSourceId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingEvents: number;
  failedEvents: number;
}

export interface NotionOutboxEvent {
  id: string;
  entityType: NotionEntityType;
  entityId: string;
  eventType: NotionEventType;
  payload: Record<string, unknown>;
  attempts: number;
}
