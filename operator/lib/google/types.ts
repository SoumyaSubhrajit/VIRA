import type { Credentials } from 'google-auth-library';

export interface GoogleConnectionRecord {
  userId: string;
  email: string;
  encryptedTokens: string;
  scopes: string[];
  taskListId: string;
  taskListTitle: string;
  calendarId: string;
  calendarSyncEnabled: boolean;
  tasksSyncEnabled: boolean;
  gmailSendEnabled: boolean;
  connectedAt: string;
  updatedAt: string;
}

export interface GoogleTaskLink {
  localTaskId: string;
  calendarEventId: string | null;
  googleTaskId: string | null;
  syncedAt: string | null;
  syncError: string | null;
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  expectedEmail: string;
  email: string | null;
  redirectUri: string;
  calendarSyncEnabled: boolean;
  tasksSyncEnabled: boolean;
  gmailSendEnabled: boolean;
  taskListTitle: string | null;
  connectedAt: string | null;
}

export interface GoogleAgendaEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  htmlLink: string | null;
  fromVira: boolean;
}

export interface GoogleAgendaTask {
  id: string;
  title: string;
  notes: string;
  due: string | null;
  status: 'needsAction' | 'completed';
  webViewLink: string | null;
  fromVira: boolean;
}

export interface GoogleAgendaSnapshot {
  date: string;
  events: GoogleAgendaEvent[];
  tasks: GoogleAgendaTask[];
}

export interface DecryptedGoogleConnection extends GoogleConnectionRecord {
  tokens: Credentials;
}

export interface GoogleSyncResult {
  calendar: 'synced' | 'disabled' | 'failed';
  tasks: 'synced' | 'disabled' | 'failed';
  error?: string;
}
