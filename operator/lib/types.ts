// ─── Gym ─────────────────────────────────────────────────────────────────────

export type DayType = string;

export interface GymDay {
  date: string;       // ISO string
  weekday: string;
  dayType: DayType;
  exercises: string[];
  muscleFocus: string;
  completed: boolean | null; // null = not yet logged
  notes: string;
}

export interface GymData {
  today: GymDay | null;
  weekDays: GymDay[];          // current Mon-Sat block
  last7Days: GymDay[];         // for streak grid
  weekCompletion: number;      // sessions completed this week
  weekTotal: number;           // sessions scheduled this week (excl. Rest)
  currentStreak: number;       // consecutive completed days
}

// ─── Finance ─────────────────────────────────────────────────────────────────

export interface FinanceCategory {
  name: string;
  spent: number;
  budget: number;
}

export interface FinanceData {
  month: string;
  totalSpent: number;
  totalBudget: number;
  savingsRate: number;           // 0-1
  categories: FinanceCategory[];
  isMock: boolean;
  transactionCount?: number;
  lastImportAt?: string | null;
}

// ─── Career ──────────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  progress: number; // 0-100
}

export interface CareerData {
  currentPhase: string;
  currentMilestone: string;
  currentIncome: number;    // monthly in INR
  targetIncome: number;     // annual in INR
  skills: Skill[];
  targetRole: string;
  isMock: boolean;
}

// ─── Guide / Memory ──────────────────────────────────────────────────────────

export type Severity = 'info' | 'warning' | 'priority';

export interface GuideObservation {
  severity: Severity;
  observation: string;
  suggested_action: string;
}

export interface MemoryEntry extends GuideObservation {
  timestamp: string; // ISO
  id: string;
}

// ─── Combined data summary sent to Gemini ────────────────────────────────────

export interface DataSummary {
  gym: {
    today: { dayType: string; exercises: string[] } | null;
    weekCompletion: string;
    currentStreak: number;
  };
  finance: {
    month: string;
    totalSpent: number;
    totalBudget: number;
    savingsRate: string;
    isMock: boolean;
  };
  career: {
    currentPhase: string;
    currentMilestone: string;
    currentIncome: number;
    targetIncome: number;
    isMock: boolean;
  };
}
