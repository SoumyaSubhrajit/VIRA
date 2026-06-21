import { NextResponse } from 'next/server';
import { getGymData } from '@/lib/gymData';
import { getFinanceData } from '@/lib/financeData';
import { getCareerData } from '@/lib/careerData';
import { getMemory, saveMemory } from '@/lib/memoryStore';
import { getGuideObservation } from '@/lib/geminiClient';
import type { DataSummary } from '@/lib/types';

export async function POST() {
  try {
    const userId = 'default-user';

    // Gather current state from all three data sources
    const [gym, finance, career] = await Promise.all([
      Promise.resolve(getGymData(userId)),
      Promise.resolve(getFinanceData(userId)),
      Promise.resolve(getCareerData(userId)),
    ]);

    const dataSummary: DataSummary = {
      gym: {
        today: gym.today
          ? { dayType: gym.today.dayType, exercises: gym.today.exercises }
          : null,
        weekCompletion: `${gym.weekCompletion}/${gym.weekTotal}`,
        currentStreak: gym.currentStreak,
      },
      finance: {
        month: finance.month,
        totalSpent: finance.totalSpent,
        totalBudget: finance.totalBudget,
        savingsRate: `${Math.round(finance.savingsRate * 100)}%`,
        isMock: finance.isMock,
      },
      career: {
        currentPhase: career.currentPhase,
        currentMilestone: career.currentMilestone,
        currentIncome: career.currentIncome,
        targetIncome: career.targetIncome,
        isMock: career.isMock,
      },
    };

    const memoryHistory = getMemory(userId);
    const observation = await getGuideObservation(dataSummary, memoryHistory);
    const saved = saveMemory(userId, observation);

    return NextResponse.json(saved);
  } catch (err) {
    console.error('[api/guide]', err);
    return NextResponse.json(
      { error: 'Guide failed', detail: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const memory = getMemory('default-user');
    return NextResponse.json(memory);
  } catch (err) {
    return NextResponse.json([], { status: 200 });
  }
}
