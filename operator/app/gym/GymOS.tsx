'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  Check,
  Dumbbell,
  Mail,
  Palette,
  Play,
  Plus,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { applyUiTheme, getSavedUiTheme, UI_THEMES, type UiTheme } from '@/lib/theme';
import type { GymOsSnapshot, GymTemplateExercise } from '@/lib/gym/types';

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatShortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function GymOS() {
  const [tab, setTab] = useState('today');
  const [date, setDate] = useState(todayIso);
  const [snapshot, setSnapshot] = useState<GymOsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState<UiTheme>('light');

  // Inline set inputs keyed by exercise id
  const [setInputs, setSetInputs] = useState<Record<string, { weight: string; reps: string }>>({});

  // Quick weight log
  const [weightInput, setWeightInput] = useState('');

  // Reminders & schedule settings
  const [remEnabled, setRemEnabled] = useState(true);
  const [remEmail, setRemEmail] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [sessionMins, setSessionMins] = useState('90');

  // Weekly split editor
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [editingExercises, setEditingExercises] = useState<GymTemplateExercise[]>([]);

  // Drag-and-drop swap state for This Week strip
  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  useEffect(() => {
    const saved = getSavedUiTheme();
    setTheme(saved);
    applyUiTheme(saved);
  }, []);

  const syncFormState = useCallback((snap: GymOsSnapshot) => {
    setRemEnabled(snap.reminders.enabled);
    setRemEmail(snap.reminders.recipientEmail);
    setStartTime(snap.profile.trainingStartTime);
    setSessionMins(String(snap.profile.sessionMinutes));
    setWeightInput(
      snap.todayCheckIn?.weightKg != null
        ? String(snap.todayCheckIn.weightKg)
        : String(snap.profile.currentWeightKg),
    );
    setSelectedTemplateId((prev) => {
      const targetId = prev || snap.todayTemplate.id;
      const tpl = snap.templates.find((t) => t.id === targetId) ?? snap.templates[0];
      if (tpl) setEditingExercises(tpl.exercises);
      return tpl?.id ?? '';
    });
  }, []);

  const loadSnapshot = useCallback(
    async (targetDate = date) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gym/os?date=${encodeURIComponent(targetDate)}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as GymOsSnapshot;
        if (res.ok) {
          setSnapshot(json);
          syncFormState(json);
        }
      } finally {
        setLoading(false);
      }
    },
    [date, syncFormState],
  );

  useEffect(() => {
    loadSnapshot(date);
  }, [date, loadSnapshot]);

  async function postAction(payload: Record<string, unknown>, successMsg?: string) {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/gym/os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setSnapshot(json as GymOsSnapshot);
      syncFormState(json as GymOsSnapshot);
      if (successMsg) setNotice(successMsg);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogSet(exerciseId: string, exerciseName: string) {
    const input = setInputs[exerciseId] ?? { weight: '', reps: '' };
    const weightKg = Number(input.weight);
    const reps = Number(input.reps);
    if (!Number.isFinite(weightKg) || weightKg < 0 || !Number.isFinite(reps) || reps < 1) {
      setNotice('Enter valid weight and reps');
      return;
    }
    await postAction({
      action: 'log_set',
      exerciseId,
      exerciseName,
      weightKg,
      reps,
      rir: 2,
      pain: 0,
      warmup: false,
      notes: '',
    });
  }

  async function handleFinishWorkout() {
    if (!snapshot) return;
    await postAction(
      {
        action: 'finish_session',
        durationMinutes: snapshot.profile.sessionMinutes || 90,
        postPain: 0,
        postFatigue: 3,
        notes: '',
      },
      'Workout completed!',
    );
  }

  async function handleSaveWeight() {
    const kg = Number(weightInput);
    if (!Number.isFinite(kg) || kg < 30 || kg > 300) {
      setNotice('Enter a valid weight in kg');
      return;
    }
    await postAction(
      {
        action: 'save_checkin',
        weightKg: kg,
        ...(snapshot?.todayCheckIn ?? {}),
      },
      `Logged ${kg} kg`,
    );
  }

  async function handleSaveReminders() {
    if (!snapshot) return;
    setBusy(true);
    setNotice('');
    try {
      await fetch('/api/gym/os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          date,
          ...snapshot.profile,
          trainingStartTime: startTime,
          sessionMinutes: Number(sessionMins) || 90,
        }),
      });
      const res = await fetch('/api/gym/os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_gym_reminders',
          date,
          enabled: remEnabled,
          recipientEmail: remEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save reminders');
      setSnapshot(json as GymOsSnapshot);
      syncFormState(json as GymOsSnapshot);
      setNotice('Reminders saved');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save reminders');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTestEmail() {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/gym/reminders/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Test email failed');
      setNotice(`Test email sent to ${json.recipient}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setBusy(false);
    }
  }

  function handleThemeChange(nextTheme: UiTheme) {
    setTheme(nextTheme);
    applyUiTheme(nextTheme);
  }

  const todayTemplate = snapshot?.todayTemplate;
  const session = snapshot?.todaySession;
  const totalTargetSets =
    todayTemplate?.exercises.reduce((sum, e) => sum + e.targetSets, 0) ?? 0;
  const loggedSetsCount = session?.sets.filter((s) => !s.warmup).length ?? 0;
  const sessionPct =
    totalTargetSets > 0 ? Math.min(100, Math.round((loggedSetsCount / totalTargetSets) * 100)) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimal Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Operator
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-sm font-semibold tracking-tight">Gym</h1>
            {session?.status === 'completed' && <Badge variant="success">Completed</Badge>}
            {session?.status === 'in_progress' && <Badge variant="warning">In Progress</Badge>}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Workout date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground"
            />
            <div className="relative flex items-center">
              <Palette className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                aria-label="UI Style"
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value as UiTheme)}
                className="h-8 rounded-lg border border-border bg-card pl-8 pr-2.5 text-xs font-medium text-foreground focus:outline-none"
              >
                {UI_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        {notice && (
          <div className="mb-4 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-emerald-600">
            {notice}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="plan">Plan & Reminders</TabsTrigger>
          </TabsList>

          {/* ── TAB 1: TODAY ──────────────────────────────────────────────── */}
          <TabsContent value="today" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {formatShortDate(date)}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight">
                      {todayTemplate?.name ?? 'Loading...'}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {todayTemplate?.focus}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {snapshot && (
                      <select
                        aria-label="Switch today's workout"
                        value={todayTemplate?.id ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          postAction({ action: 'save_one_day_plan', templateId: e.target.value })
                        }
                        className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground"
                      >
                        {snapshot.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {!session && todayTemplate && todayTemplate.weekday !== 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          postAction({
                            action: 'start_session',
                            templateId: todayTemplate.id,
                            prePain: 0,
                          })
                        }
                      >
                        <Play className="h-3.5 w-3.5" />
                        Start Workout
                      </Button>
                    )}

                    {session && session.status !== 'completed' && (
                      <Button
                        variant="default"
                        size="sm"
                        disabled={busy}
                        onClick={handleFinishWorkout}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Finish Workout
                      </Button>
                    )}
                  </div>
                </div>

                {todayTemplate && todayTemplate.exercises.length > 0 && (
                  <div className="mt-5 space-y-1.5">
                    <Progress value={sessionPct} />
                    <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                      <span>
                        {loggedSetsCount} / {totalTargetSets} target sets logged
                      </span>
                      <span>{sessionPct}%</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Exercise Cards */}
            {todayTemplate?.weekday === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-xs text-muted-foreground">
                  Rest day. Recover, walk, and prepare for Monday.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(todayTemplate?.exercises ?? []).map((ex) => {
                  const logged =
                    session?.sets.filter(
                      (s) => s.exerciseId === ex.id || s.exerciseName.toLowerCase() === ex.name.toLowerCase(),
                    ) ?? [];
                  const val = setInputs[ex.id] ?? { weight: '', reps: '' };
                  const hintInfo = snapshot?.exerciseHints?.[ex.id];

                  return (
                    <Card key={ex.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {String(ex.order).padStart(2, '0')}
                              </span>
                              <span className="text-sm font-semibold">{ex.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {ex.muscleGroup} · {ex.targetSets} × {ex.minReps}–{ex.maxReps} reps
                            </p>
                            {hintInfo && (
                              <p className="mt-1 text-[11px] font-medium text-emerald-600">
                                Last ({hintInfo.lastDate}): {hintInfo.lastSets} · {hintInfo.hint}
                              </p>
                            )}
                          </div>
                          <Badge variant={logged.length >= ex.targetSets ? 'success' : 'muted'}>
                            {logged.length}/{ex.targetSets} sets
                          </Badge>
                        </div>

                        {logged.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {logged.map((set) => (
                              <span
                                key={set.id}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium tabular-nums"
                              >
                                {set.weightKg}kg × {set.reps}
                                <button
                                  type="button"
                                  aria-label="Delete set"
                                  disabled={busy}
                                  onClick={() => postAction({ action: 'delete_set', setId: set.id })}
                                  className="text-muted-foreground hover:text-red-600 cursor-pointer"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.5"
                            placeholder="Weight (kg)"
                            value={val.weight}
                            onChange={(e) =>
                              setSetInputs((prev) => ({
                                ...prev,
                                [ex.id]: { ...val, weight: e.target.value },
                              }))
                            }
                            className="h-8 w-28 rounded-lg border border-border bg-background px-2.5 text-xs tabular-nums"
                          />
                          <input
                            type="number"
                            placeholder="Reps"
                            value={val.reps}
                            onChange={(e) =>
                              setSetInputs((prev) => ({
                                ...prev,
                                [ex.id]: { ...val, reps: e.target.value },
                              }))
                            }
                            className="h-8 w-20 rounded-lg border border-border bg-background px-2.5 text-xs tabular-nums"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => handleLogSet(ex.id, ex.name)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Log Set
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── TAB 2: PROGRESS ───────────────────────────────────────────── */}
          <TabsContent value="progress" className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    This Week
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {snapshot?.trends.completedThisWeek ?? 0} / {snapshot?.trends.plannedThisWeek ?? 6}
                  </p>
                  <p className="text-[11px] text-muted-foreground">sessions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Streak
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {snapshot?.trends.streak ?? 0} days
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Weight
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {snapshot?.profile.currentWeightKg ?? '—'} kg
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    target {snapshot?.profile.targetWeightKg ?? '—'} kg
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Volume
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {(snapshot?.trends.totalVolumeKg ?? 0).toLocaleString('en-IN')} kg
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 7-Day Consistency (Draggable to swap days) */}
            <Card>
              <CardHeader>
                <CardTitle>This Week</CardTitle>
                <CardDescription>Drag any day onto another to swap workouts · Click to open</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {(snapshot?.week ?? []).map((day) => {
                    const done = day.sessionStatus === 'completed';
                    const rest = day.template.weekday === 0;
                    const active = day.date === date;
                    const isDragging = dragDate === day.date;
                    const isDropTarget = dragOverDate === day.date && dragDate !== day.date;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        draggable={!busy}
                        onDragStart={(e) => {
                          setDragDate(day.date);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', day.date);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverDate !== day.date) setDragOverDate(day.date);
                        }}
                        onDragLeave={() => {
                          if (dragOverDate === day.date) setDragOverDate(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sourceDate = dragDate || e.dataTransfer.getData('text/plain');
                          setDragDate(null);
                          setDragOverDate(null);
                          if (!sourceDate || sourceDate === day.date) return;
                          const source = snapshot?.week.find((w) => w.date === sourceDate);
                          if (!source) return;
                          void postAction(
                            {
                              action: 'swap_schedule',
                              firstDate: source.date,
                              secondDate: day.date,
                              firstTemplateId: source.template.id,
                              secondTemplateId: day.template.id,
                            },
                            `Swapped ${source.weekday} (${source.template.shortName}) ↔ ${day.weekday} (${day.template.shortName})`,
                          );
                        }}
                        onDragEnd={() => {
                          setDragDate(null);
                          setDragOverDate(null);
                        }}
                        onClick={() => {
                          setDate(day.date);
                          setTab('today');
                        }}
                        className={`flex flex-col items-center rounded-lg border p-2.5 text-center transition-all cursor-grab active:cursor-grabbing ${
                          isDropTarget
                            ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-500/10 scale-[1.03]'
                            : isDragging
                            ? 'opacity-40 border-dashed border-foreground'
                            : done
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : active
                            ? 'border-foreground bg-muted'
                            : 'border-border bg-card hover:bg-muted/50'
                        }`}
                      >
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {day.weekday}
                        </span>
                        <span className="mt-1 text-xs font-bold">
                          {done ? '✓' : rest ? 'Rest' : day.template.shortName}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground truncate max-w-full">
                          {day.template.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Quick Weight Log & Trend */}
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Body Weight</CardTitle>
                  <CardDescription>Log today&apos;s morning weight</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="kg"
                    className="h-8 w-24 rounded-lg border border-border bg-background px-2.5 text-xs tabular-nums"
                  />
                  <Button size="sm" variant="default" disabled={busy} onClick={handleSaveWeight}>
                    Save Weight
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(snapshot?.trends.weight.length ?? 0) > 0 ? (
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={snapshot?.trends.weight ?? []}>
                        <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          name="Weight (kg)"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Log your weight above to start tracking your trend.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Personal Records */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Personal Records</CardTitle>
                  <CardDescription>Your best logged sets</CardDescription>
                </div>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {(snapshot?.personalRecords.length ?? 0) > 0 ? (
                  <div className="divide-y divide-border">
                    {snapshot?.personalRecords.slice(0, 10).map((pr) => (
                      <div
                        key={pr.exerciseName}
                        className="flex items-center justify-between py-2.5 text-xs"
                      >
                        <span className="font-medium">{pr.exerciseName}</span>
                        <span className="font-semibold tabular-nums">
                          {pr.weightKg} kg × {pr.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Log sets in the Today tab to record your first PRs.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB 3: PLAN & REMINDERS ───────────────────────────────────── */}
          <TabsContent value="plan" className="space-y-6">
            {/* Reminders */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Daily Gym Reminders</CardTitle>
                  <CardDescription>
                    Briefing 30m before · Debrief after session
                  </CardDescription>
                </div>
                <Badge variant={remEnabled ? 'success' : 'muted'}>
                  {remEnabled ? 'Active' : 'Paused'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Start Time</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="block h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Duration (mins)</span>
                    <input
                      type="number"
                      min={15}
                      max={240}
                      value={sessionMins}
                      onChange={(e) => setSessionMins(e.target.value)}
                      className="block h-9 w-full rounded-lg border border-border bg-background px-3 text-xs tabular-nums"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Email</span>
                    <input
                      type="email"
                      value={remEmail}
                      onChange={(e) => setRemEmail(e.target.value)}
                      className="block h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remEnabled}
                      onChange={(e) => setRemEnabled(e.target.checked)}
                    />
                    Enable daily email reminders
                  </label>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !remEmail}
                      onClick={handleSendTestEmail}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Send Test Email
                    </Button>
                    <Button variant="default" size="sm" disabled={busy} onClick={handleSaveReminders}>
                      Save Reminders
                    </Button>
                  </div>
                </div>

                {snapshot && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
                    Schedule:{' '}
                    {snapshot.reminders.schedule.map((s) => `${s.time} ${s.label}`).join(' · ')}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Split Editor */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Split</CardTitle>
                <CardDescription>Customize exercises for each training day</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {(snapshot?.templates ?? []).map((tpl) => (
                    <Button
                      key={tpl.id}
                      size="sm"
                      variant={selectedTemplateId === tpl.id ? 'default' : 'outline'}
                      onClick={() => {
                        setSelectedTemplateId(tpl.id);
                        setEditingExercises(tpl.exercises);
                      }}
                    >
                      {tpl.name}
                    </Button>
                  ))}
                </div>

                {editingExercises.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Rest day — no exercises scheduled.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editingExercises.map((ex, idx) => (
                      <div key={ex.id} className="grid grid-cols-12 items-center gap-2">
                        <input
                          value={ex.name}
                          onChange={(e) => {
                            const next = [...editingExercises];
                            next[idx] = { ...ex, name: e.target.value };
                            setEditingExercises(next);
                          }}
                          className="col-span-6 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
                        />
                        <input
                          type="number"
                          value={ex.targetSets}
                          onChange={(e) => {
                            const next = [...editingExercises];
                            next[idx] = { ...ex, targetSets: Number(e.target.value) || 3 };
                            setEditingExercises(next);
                          }}
                          aria-label="Sets"
                          className="col-span-2 h-8 rounded-lg border border-border bg-background px-2 text-xs tabular-nums"
                        />
                        <input
                          type="number"
                          value={ex.minReps}
                          onChange={(e) => {
                            const next = [...editingExercises];
                            next[idx] = { ...ex, minReps: Number(e.target.value) || 8 };
                            setEditingExercises(next);
                          }}
                          aria-label="Min reps"
                          className="col-span-2 h-8 rounded-lg border border-border bg-background px-2 text-xs tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingExercises(editingExercises.filter((_, i) => i !== idx))
                          }
                          className="col-span-2 inline-flex h-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-red-600 cursor-pointer"
                          aria-label="Remove exercise"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="flex justify-between pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingExercises([
                            ...editingExercises,
                            {
                              id: crypto.randomUUID(),
                              name: 'New Exercise',
                              muscleGroup: 'General',
                              order: editingExercises.length + 1,
                              targetSets: 3,
                              minReps: 8,
                              maxReps: 12,
                              restSeconds: 90,
                            },
                          ])
                        }
                      >
                        <Dumbbell className="h-3.5 w-3.5" />
                        Add Exercise
                      </Button>

                      <Button
                        size="sm"
                        variant="default"
                        disabled={busy}
                        onClick={() =>
                          postAction(
                            {
                              action: 'save_template',
                              templateId: selectedTemplateId,
                              exercises: editingExercises,
                            },
                            'Split saved',
                          )
                        }
                      >
                        Save Split
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {loading && !snapshot && (
          <p className="py-12 text-center text-xs text-muted-foreground">Loading gym...</p>
        )}
      </main>
    </div>
  );
}
