export type ObsidianSettings = {
  userId: string;
  enabled: boolean;
  vaultPath: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ObsidianSyncResult = {
  configured: boolean;
  vaultPath: string;
  filesWritten: number;
  tasksExported: number;
  dailyLogsExported: number;
  financeMonthsExported: number;
  syncedAt: string;
};
