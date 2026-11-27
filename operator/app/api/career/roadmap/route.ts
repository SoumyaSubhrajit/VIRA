import { NextRequest, NextResponse } from 'next/server';
import {
  addCareerTask,
  evaluateAndLogCareerWork,
  getCareerRoadmap,
  importCareerRoadmap,
  setActiveCareerStage,
} from '@/lib/careerRoadmap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getCareerRoadmap();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[api/career/roadmap GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load roadmap' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (action === 'log_work') {
      const result = await evaluateAndLogCareerWork({
        stageId: String(body.stageId ?? ''),
        taskId: String(body.taskId ?? ''),
        description: String(body.description ?? ''),
      });
      return NextResponse.json(result);
    }

    if (action === 'import_text') {
      const snapshot = await importCareerRoadmap({
        goalTitle: typeof body.goalTitle === 'string' ? body.goalTitle : undefined,
        rawText: String(body.rawText ?? ''),
      });
      return NextResponse.json({ snapshot });
    }

    if (action === 'set_active_stage') {
      const snapshot = await setActiveCareerStage(String(body.stageId ?? ''));
      return NextResponse.json({ snapshot });
    }

    if (action === 'add_task') {
      const snapshot = await addCareerTask({
        stageId: typeof body.stageId === 'string' ? body.stageId : undefined,
        title: String(body.title ?? ''),
        criteria: typeof body.criteria === 'string' ? body.criteria : undefined,
      });
      return NextResponse.json({ snapshot });
    }

    return NextResponse.json({ error: 'Unknown roadmap action.' }, { status: 400 });
  } catch (error) {
    console.error('[api/career/roadmap POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Roadmap action failed' },
      { status: 400 },
    );
  }
}
