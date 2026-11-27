import { NextRequest, NextResponse } from 'next/server';
import {
  generateCareerWeeklyFocus,
  getCareerData,
  saveCareerData,
} from '@/lib/careerData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getCareerData('default-user');
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/career GET]', err);
    return NextResponse.json(
      { error: 'Failed to load career data', detail: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'ai_focus') {
      const updated = await generateCareerWeeklyFocus('default-user');
      return NextResponse.json(updated);
    }

    const updated = await saveCareerData(
      {
        currentPhase: typeof body.currentPhase === 'string' ? body.currentPhase : undefined,
        currentMilestone: typeof body.currentMilestone === 'string' ? body.currentMilestone : undefined,
        targetRole: typeof body.targetRole === 'string' ? body.targetRole : undefined,
        currentIncome: typeof body.currentIncome === 'number' ? body.currentIncome : undefined,
        targetIncome: typeof body.targetIncome === 'number' ? body.targetIncome : undefined,
        skills: Array.isArray(body.skills) ? (body.skills as CareerSkillInput[]) : undefined,
      },
      'default-user',
    );
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/career POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save career data' },
      { status: 400 },
    );
  }
}

type CareerSkillInput = { name: string; progress: number };
