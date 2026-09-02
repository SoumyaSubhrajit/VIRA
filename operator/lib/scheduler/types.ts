export type PersonalityId = 'home' | 'builder' | 'free';
export type TaskStatus = 'planned' | 'completed' | 'skipped';
export type ReminderChannel = 'in_app' | 'email' | 'both';

export interface PersonalityMode {
  id: PersonalityId;
  name: string;
  shortName: string;
  purpose: string;
  identityStatement: string;
  behaviorRules: string[];
  sortOrder: number;
}

export interface SchedulerTask {
  id: string;
  userId: string;
  title: string;
  details: string;
  taskDate: string;
  startTime: string;
  endTime: string | null;
  endAt: string | null;
  scheduledAt: string;
  personalityId: PersonalityId;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  reminderMinutes: number;
  reminderChannel: ReminderChannel;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SchedulerSettings {
  userId: string;
  subjectName: string;
  reminderEmail: string;
  timezone: string;
  emailEnabled: boolean;
  browserEnabled: boolean;
  checkInEnabled: boolean;
  checkInIntervalHours: number;
  checkInStartTime: string;
  checkInEndTime: string;
  checkInLastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerSnapshot {
  date: string;
  tasks: SchedulerTask[];
  personalities: PersonalityMode[];
  settings: SchedulerSettings;
  dayPlan: SchedulerDayPlan;
  serverTime: string;
}

export interface SchedulerDayPlan {
  userId: string;
  planDate: string;
  locked: boolean;
  lockedAt: string | null;
  hourlyLastSentAt: string | null;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  details?: string;
  taskDate: string;
  startTime: string;
  endTime?: string | null;
  endAt?: string | null;
  scheduledAt: string;
  personalityId: PersonalityId;
  priority?: 1 | 2 | 3;
  reminderMinutes?: number;
  reminderChannel?: ReminderChannel;
}

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};
