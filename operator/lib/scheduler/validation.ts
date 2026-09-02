import type {
  CreateTaskInput,
  PersonalityId,
  ReminderChannel,
  TaskStatus,
  UpdateTaskInput,
} from './types';

const PERSONALITIES = new Set<PersonalityId>(['home', 'builder', 'free']);
const STATUSES = new Set<TaskStatus>(['planned', 'completed', 'skipped']);
const CHANNELS = new Set<ReminderChannel>(['in_app', 'email', 'both']);

export class SchedulerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerValidationError';
  }
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SchedulerValidationError(`${field} is required.`);
  }
  const clean = value.trim();
  if (clean.length > max) {
    throw new SchedulerValidationError(`${field} must be ${max} characters or fewer.`);
  }
  return clean;
}

function optionalString(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new SchedulerValidationError(`${field} must be text.`);
  }
  const clean = value.trim();
  if (clean.length > max) {
    throw new SchedulerValidationError(`${field} must be ${max} characters or fewer.`);
  }
  return clean;
}

function validateDate(value: unknown): string {
  const date = requiredString(value, 'taskDate', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new SchedulerValidationError('taskDate must use YYYY-MM-DD.');
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new SchedulerValidationError('taskDate is not a valid date.');
  }
  return date;
}

function validateTime(value: unknown, field: string, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const time = requiredString(value, field, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new SchedulerValidationError(`${field} must use 24-hour HH:mm time.`);
  }
  return time;
}

function validateScheduledAt(value: unknown): string {
  const scheduledAt = requiredString(value, 'scheduledAt', 40);
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new SchedulerValidationError('scheduledAt must be a valid ISO timestamp.');
  }
  return parsed.toISOString();
}

function validateEndAt(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new SchedulerValidationError('endAt must be an ISO timestamp.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new SchedulerValidationError('endAt must be a valid ISO timestamp.');
  return parsed.toISOString();
}

function validatePersonality(value: unknown): PersonalityId {
  if (typeof value !== 'string' || !PERSONALITIES.has(value as PersonalityId)) {
    throw new SchedulerValidationError('personalityId must be home, builder, or free.');
  }
  return value as PersonalityId;
}

function validatePriority(value: unknown): 1 | 2 | 3 {
  const priority = value === undefined ? 2 : Number(value);
  if (![1, 2, 3].includes(priority)) {
    throw new SchedulerValidationError('priority must be 1, 2, or 3.');
  }
  return priority as 1 | 2 | 3;
}

function validateReminderMinutes(value: unknown): number {
  const minutes = value === undefined ? 15 : Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new SchedulerValidationError('reminderMinutes must be between 0 and 1440.');
  }
  return minutes;
}

function validateChannel(value: unknown): ReminderChannel {
  const channel = value === undefined ? 'both' : value;
  if (typeof channel !== 'string' || !CHANNELS.has(channel as ReminderChannel)) {
    throw new SchedulerValidationError('reminderChannel must be in_app, email, or both.');
  }
  return channel as ReminderChannel;
}

export function validateCreateTask(body: unknown): CreateTaskInput {
  if (!body || typeof body !== 'object') {
    throw new SchedulerValidationError('A JSON task object is required.');
  }
  const input = body as Record<string, unknown>;
  const startTime = validateTime(input.startTime, 'startTime') as string;
  const endTime = validateTime(input.endTime, 'endTime', true);
  const taskDate = validateDate(input.taskDate);
  const scheduledAt = validateScheduledAt(input.scheduledAt);
  const endAt = validateEndAt(input.endAt)
    ?? (endTime ? new Date(`${taskDate}T${endTime}:00+05:30`).toISOString() : null);
  if (endAt && new Date(endAt).getTime() <= new Date(scheduledAt).getTime()) {
    throw new SchedulerValidationError('Task end must be later than its start. Select “next day” for an overnight task.');
  }

  return {
    title: requiredString(input.title, 'title', 140),
    details: optionalString(input.details, 'details', 2000),
    taskDate,
    startTime,
    endTime,
    endAt,
    scheduledAt,
    personalityId: validatePersonality(input.personalityId),
    priority: validatePriority(input.priority),
    reminderMinutes: validateReminderMinutes(input.reminderMinutes),
    reminderChannel: validateChannel(input.reminderChannel),
  };
}

export function validateUpdateTask(body: unknown): UpdateTaskInput {
  if (!body || typeof body !== 'object') {
    throw new SchedulerValidationError('A JSON update object is required.');
  }
  const input = body as Record<string, unknown>;
  const update: UpdateTaskInput = {};

  if ('title' in input) update.title = requiredString(input.title, 'title', 140);
  if ('details' in input) update.details = optionalString(input.details, 'details', 2000);
  if ('taskDate' in input) update.taskDate = validateDate(input.taskDate);
  if ('startTime' in input) update.startTime = validateTime(input.startTime, 'startTime') as string;
  if ('endTime' in input) update.endTime = validateTime(input.endTime, 'endTime', true);
  if ('endAt' in input) update.endAt = validateEndAt(input.endAt);
  if ('scheduledAt' in input) update.scheduledAt = validateScheduledAt(input.scheduledAt);
  if ('personalityId' in input) update.personalityId = validatePersonality(input.personalityId);
  if ('priority' in input) update.priority = validatePriority(input.priority);
  if ('reminderMinutes' in input) update.reminderMinutes = validateReminderMinutes(input.reminderMinutes);
  if ('reminderChannel' in input) update.reminderChannel = validateChannel(input.reminderChannel);
  if ('status' in input) {
    if (typeof input.status !== 'string' || !STATUSES.has(input.status as TaskStatus)) {
      throw new SchedulerValidationError('status must be planned, completed, or skipped.');
    }
    update.status = input.status as TaskStatus;
  }

  if (update.scheduledAt && update.endAt && new Date(update.endAt).getTime() <= new Date(update.scheduledAt).getTime()) {
    throw new SchedulerValidationError('Task end must be later than its start.');
  }
  if (Object.keys(update).length === 0) {
    throw new SchedulerValidationError('At least one task field must be provided.');
  }
  return update;
}

export function validateEmail(value: unknown): string {
  if (value === '' || value === null || value === undefined) return '';
  const email = requiredString(value, 'reminderEmail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SchedulerValidationError('reminderEmail must be a valid email address.');
  }
  return email;
}
