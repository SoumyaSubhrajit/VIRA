import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/scheduler/db';
import { applyGymAction, getGymOsSnapshot } from '@/lib/gym/db';
import { getFinanceData } from '@/lib/financeData';
import { getCareerData, saveCareerData } from '@/lib/careerData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { command?: string };
    const command = String(body.command ?? '').trim();
    if (!command) {
      return NextResponse.json({ error: 'Enter a command or question.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 503 });
    }

    const today = istToday();
    const [gym, finance, career] = await Promise.all([
      getGymOsSnapshot(today),
      getFinanceData('default-user'),
      getCareerData('default-user'),
    ]);

    const context = {
      today,
      timezone: 'Asia/Kolkata',
      gymWeek: gym.week.map((w) => ({
        date: w.date,
        weekday: w.weekday,
        workout: w.template.name,
        templateId: w.template.id,
      })),
      finance: {
        month: finance.month,
        totalSpent: finance.totalSpent,
        totalBudget: finance.totalBudget,
        liquidBalance: finance.liquidBalance,
        topCategories: finance.categories.slice(0, 5),
      },
      career: {
        phase: career.currentPhase,
        milestone: career.currentMilestone,
        monthlyIncome: career.currentIncome,
      },
    };

    const model = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are VIRA Command Router. Parse the user's request into ONE JSON action using the provided state.
Valid actions:
1) {"action":"create_task","title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","priority":1|2|3}
2) {"action":"log_weight","weightKg":number,"date":"YYYY-MM-DD"}
3) {"action":"swap_gym","firstDate":"YYYY-MM-DD","secondDate":"YYYY-MM-DD"}
4) {"action":"update_career","currentMilestone":"...","currentIncome":number|null}
5) {"action":"answer","message":"concise 1-2 sentence answer using live data"}

Always return valid JSON only.`,
          },
          {
            role: 'user',
            content: JSON.stringify({ command, context }),
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`OpenAI failed (${aiRes.status})`);
    }

    const payload = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty AI command response');

    const intent = JSON.parse(raw) as Record<string, unknown>;
    const action = String(intent.action ?? 'answer');

    if (action === 'create_task') {
      const title = String(intent.title ?? command).slice(0, 140);
      const taskDate = /^\d{4}-\d{2}-\d{2}$/.test(String(intent.date)) ? String(intent.date) : today;
      const startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(intent.startTime))
        ? String(intent.startTime)
        : '09:00';
      const priorityNum = Number(intent.priority);
      const priority: 1 | 2 | 3 = priorityNum === 1 ? 1 : priorityNum === 3 ? 3 : 2;
      const scheduledAt = new Date(`${taskDate}T${startTime}:00+05:30`).toISOString();

      const task = await createTask({
        title,
        taskDate,
        startTime,
        scheduledAt,
        personalityId: 'builder',
        priority,
        reminderMinutes: 0,
        reminderChannel: 'both',
      });
      return NextResponse.json({
        ok: true,
        action,
        message: `Task added: "${task.title}" on ${task.taskDate} at ${task.startTime}.`,
      });
    }

    if (action === 'log_weight') {
      const weightKg = Number(intent.weightKg);
      const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(intent.date)) ? String(intent.date) : today;
      if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
        return NextResponse.json({ ok: false, message: 'Specify a valid weight in kg.' });
      }
      await applyGymAction({ action: 'save_checkin', date: targetDate, weightKg });
      return NextResponse.json({
        ok: true,
        action,
        message: `Logged weight ${weightKg} kg for ${targetDate}.`,
      });
    }

    if (action === 'swap_gym') {
      const firstDate = String(intent.firstDate ?? '');
      const secondDate = String(intent.secondDate ?? '');
      const first = gym.week.find((w) => w.date === firstDate);
      const second = gym.week.find((w) => w.date === secondDate);
      if (!first || !second || firstDate === secondDate) {
        return NextResponse.json({
          ok: false,
          message: 'Specify two different days in this week to swap.',
        });
      }
      await applyGymAction({
        action: 'swap_schedule',
        date: today,
        firstDate,
        secondDate,
        firstTemplateId: first.template.id,
        secondTemplateId: second.template.id,
      });
      return NextResponse.json({
        ok: true,
        action,
        message: `Swapped ${first.weekday} (${first.template.name}) ↔ ${second.weekday} (${second.template.name}).`,
      });
    }

    if (action === 'update_career') {
      await saveCareerData({
        currentMilestone:
          typeof intent.currentMilestone === 'string' ? intent.currentMilestone : undefined,
        currentIncome:
          typeof intent.currentIncome === 'number' ? intent.currentIncome : undefined,
      });
      return NextResponse.json({
        ok: true,
        action,
        message: 'Career progress updated.',
      });
    }

    return NextResponse.json({
      ok: true,
      action: 'answer',
      message: String(intent.message ?? 'Done.'),
    });
  } catch (err) {
    console.error('[api/command POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Command failed' },
      { status: 500 },
    );
  }
}
