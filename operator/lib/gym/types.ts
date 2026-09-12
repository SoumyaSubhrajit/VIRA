export type GymProfile = {
  userId: string;
  name: string;
  age: number;
  sex: string;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  currentBodyFatPct: number;
  targetBodyFatPct: number;
  targetDate: string;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  waterTargetL: number;
  stepsTarget: number;
  trainingStartTime: string;
  sessionMinutes: number;
  timezone: string;
};

export type GymTemplateExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  order: number;
  targetSets: number;
  minReps: number;
  maxReps: number;
  restSeconds: number;
};

export type GymWorkoutTemplate = {
  id: string;
  weekday: number;
  name: string;
  shortName: string;
  focus: string;
  accent: string;
  exercises: GymTemplateExercise[];
};

export type GymSetLog = {
  id: string;
  exerciseId: string | null;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number;
  pain: number;
  warmup: boolean;
  notes: string;
  loggedAt: string;
  volumeKg: number;
  estimatedOneRepMax: number;
};

export type GymSession = {
  id: string;
  date: string;
  templateId: string | null;
  name: string;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  prePain: number | null;
  postPain: number | null;
  energy: number | null;
  postFatigue: number | null;
  notes: string;
  sets: GymSetLog[];
};

export type GymDailyCheckIn = {
  date: string;
  weightKg: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterL: number | null;
  steps: number | null;
  sleepHours: number | null;
  mood: number | null;
  fatigue: number | null;
  pain: number | null;
  notes: string;
};

export type GymMeasurement = {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  shouldersCm: number | null;
  leftBicepCm: number | null;
  rightBicepCm: number | null;
  notes: string;
};

export type GymPersonalRecord = {
  exerciseName: string;
  weightKg: number;
  reps: number;
  estimatedOneRepMax: number;
  date: string;
};

export type GymActivityDay = {
  date: string;
  status: GymSession['status'];
  durationMinutes: number;
  workingSets: number;
  totalReps: number;
  volumeKg: number;
  score: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type GymReminderSlot = 'briefing' | 'launch' | 'checkpoint-1' | 'checkpoint-2' | 'checkpoint-3' | 'debrief';

export type GymReminderScheduleItem = {
  slot: GymReminderSlot;
  time: string;
  label: string;
  purpose: string;
};

export type GymReminderDelivery = {
  slot: GymReminderSlot;
  scheduledTime: string;
  status: 'sending' | 'sent' | 'failed';
  provider: string | null;
  attempts: number;
  sentAt: string | null;
  error: string | null;
};

export type GymReminderStatus = {
  enabled: boolean;
  recipientEmail: string;
  timezone: string;
  schedule: GymReminderScheduleItem[];
  deliveries: GymReminderDelivery[];
  schedulerTaskId: string | null;
};

export type GymWeekDay = {
  date: string;
  weekday: string;
  template: GymWorkoutTemplate;
  autoTemplate: GymWorkoutTemplate;
  overrideTemplateId: string | null;
  isAuto: boolean;
  sessionStatus: GymSession['status'] | null;
};

export type GymOsSnapshot = {
  date: string;
  profile: GymProfile;
  todayTemplate: GymWorkoutTemplate;
  todaySession: GymSession | null;
  todayCheckIn: GymDailyCheckIn | null;
  templates: GymWorkoutTemplate[];
  week: GymWeekDay[];
  measurements: GymMeasurement[];
  personalRecords: GymPersonalRecord[];
  activity: GymActivityDay[];
  trends: {
    weight: Array<{ date: string; value: number }>;
    weeklyAverageWeight: number | null;
    totalVolumeKg: number;
    completedThisWeek: number;
    plannedThisWeek: number;
    streak: number;
  };
  migration: {
    importedDays: number;
    importedAt: string | null;
  };
  progressPhotoCount: number;
  reminders: GymReminderStatus;
};
