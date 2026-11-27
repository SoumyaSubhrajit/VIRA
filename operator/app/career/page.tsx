'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Palette,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { applyUiTheme, getSavedUiTheme, UI_THEMES, type UiTheme } from '@/lib/theme';
import type { CareerRoadmapSnapshot } from '@/lib/careerRoadmap';

export default function CareerPage() {
  const [tab, setTab] = useState('roadmap');
  const [data, setData] = useState<CareerRoadmapSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<UiTheme>('light');

  // Active logging state
  const [loggingTaskId, setLoggingTaskId] = useState<string | null>(null);
  const [workDesc, setWorkDesc] = useState('');
  const [evalBanner, setEvalBanner] = useState<{ scorePct: number; feedback: string; done: boolean } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Quick add task
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Import state
  const [goalInput, setGoalInput] = useState('C# / .NET & Automation Developer');
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    const saved = getSavedUiTheme();
    setTheme(saved);
    applyUiTheme(saved);
  }, []);

  const loadRoadmap = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/career/roadmap', { cache: 'no-store' });
      const json = (await res.json()) as CareerRoadmapSnapshot;
      if (res.ok) {
        setData(json);
        setGoalInput(json.goalTitle);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoadmap();
  }, [loadRoadmap]);

  function handleThemeChange(nextTheme: UiTheme) {
    setTheme(nextTheme);
    applyUiTheme(nextTheme);
  }

  const activeStage =
    data?.stages.find((s) => s.id === data.activeStageId) ?? data?.stages[0] ?? null;

  async function submitWorkLog(stageId: string, taskId: string) {
    if (!workDesc.trim() || busy) return;
    setBusy(true);
    setErrorMsg('');
    setEvalBanner(null);
    try {
      const res = await fetch('/api/career/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_work',
          stageId,
          taskId,
          description: workDesc,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to evaluate work');
      setData(json.snapshot as CareerRoadmapSnapshot);
      setEvalBanner(json.evaluation);
      setWorkDesc('');
      setLoggingTaskId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to log work');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectStage(stageId: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/career/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_active_stage', stageId }),
      });
      const json = await res.json();
      if (res.ok && json.snapshot) setData(json.snapshot);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim() || !activeStage || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/career/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_task',
          stageId: activeStage.id,
          title: newTaskTitle,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not add task');
      setData(json.snapshot);
      setNewTaskTitle('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setBusy(false);
    }
  }

  async function handleImportText() {
    if (!pasteText.trim() || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/career/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_text',
          goalTitle: goalInput,
          rawText: pasteText,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Roadmap parsing failed');
      setData(json.snapshot);
      setPasteText('');
      setTab('roadmap');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Roadmap import failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const form = new FormData();
      form.set('roadmap', file);
      form.set('goalTitle', goalInput);
      const res = await fetch('/api/career/roadmap/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setData(json.snapshot);
      setTab('roadmap');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
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
            <h1 className="text-sm font-semibold tracking-tight">Career Roadmap</h1>
            <Badge variant="success">● Active Goal</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/radar"
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2"
            >
              Tech Radar →
            </Link>
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

      <main className="mx-auto max-w-4xl px-5 py-8 space-y-6">
        {errorMsg && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-600">
            {errorMsg}
          </div>
        )}

        {evalBanner && (
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                <Sparkles className="h-3.5 w-3.5" />
                AI Grading Result: {evalBanner.scorePct}% {evalBanner.done ? '· Marked Done ✓' : '· In Progress'}
              </div>
              <p className="text-xs text-foreground">{evalBanner.feedback}</p>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="roadmap">Roadmap & Today</TabsTrigger>
            <TabsTrigger value="upload">Upload Roadmap</TabsTrigger>
          </TabsList>

          {/* ── TAB 1: ROADMAP & DAILY EXECUTION ──────────────────────────── */}
          <TabsContent value="roadmap" className="space-y-6">
            {/* Overall Goal Progress */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Target Role
                    </p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight">
                      {data?.goalTitle ?? 'Loading...'}
                    </h2>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold tabular-nums text-emerald-600">
                      {data?.overallProgressPct ?? 0}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">overall complete</p>
                  </div>
                </div>
                <Progress value={data?.overallProgressPct ?? 0} />

                {/* Stage Stepper */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {(data?.stages ?? []).map((stage) => {
                    const isActive = stage.id === activeStage?.id;
                    const isDone = stage.progressPct >= 100;
                    return (
                      <Button
                        key={stage.id}
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        disabled={busy}
                        onClick={() => handleSelectStage(stage.id)}
                      >
                        {isDone ? '✓ ' : ''}
                        Stage {stage.order}: {stage.title} ({stage.progressPct}%)
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Active Stage & Tasks */}
            {activeStage && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>
                        Stage {activeStage.order}: {activeStage.title}
                      </CardTitle>
                      <CardDescription>{activeStage.focus}</CardDescription>
                    </div>
                    <Badge variant={activeStage.progressPct >= 85 ? 'success' : 'muted'}>
                      {activeStage.progressPct}% done
                    </Badge>
                  </div>
                  <Progress value={activeStage.progressPct} className="h-1.5 mt-3" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeStage.tasks.map((task) => {
                    const isOpen = loggingTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        className="rounded-xl border border-border bg-background/60 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            {task.done ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className="text-sm font-semibold">{task.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Pass criteria: {task.criteria}
                              </p>
                              {task.lastNote && (
                                <p className="text-[11px] text-emerald-600 mt-1">
                                  Latest log: {task.lastNote}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                              {task.progressPct}%
                            </span>
                            <Button
                              size="sm"
                              variant={isOpen ? 'default' : 'outline'}
                              onClick={() => {
                                setLoggingTaskId(isOpen ? null : task.id);
                                setWorkDesc('');
                              }}
                            >
                              {isOpen ? 'Cancel' : 'Log Today'}
                            </Button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="space-y-2 pt-2 border-t border-border">
                            <textarea
                              rows={3}
                              value={workDesc}
                              onChange={(e) => setWorkDesc(e.target.value)}
                              placeholder="Describe strictly what you built, coded, or tested today (e.g. Built Product CRUD API with EF Core SQLite + xUnit tests for 404/201)..."
                              className="w-full rounded-lg border border-border bg-card p-3 text-xs text-foreground focus:outline-none"
                            />
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="default"
                                disabled={busy || workDesc.trim().length < 10}
                                onClick={() => submitWorkLog(activeStage.id, task.id)}
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                {busy ? 'Grading...' : 'Submit Proof & Update Progress'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Quick add custom task */}
                  <div className="flex gap-2 pt-2">
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Add a custom task to this stage..."
                      className="h-8 flex-1 rounded-lg border border-border bg-background px-3 text-xs"
                    />
                    <Button size="sm" variant="outline" disabled={busy || !newTaskTitle.trim()} onClick={handleAddTask}>
                      <Plus className="h-3.5 w-3.5" />
                      Add Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Daily Proofs */}
            {(data?.logs.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Daily Progress Log</CardTitle>
                  <CardDescription>Verified proofs and AI mentor feedback</CardDescription>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {data?.logs.slice(0, 8).map((log) => (
                    <div key={log.id} className="py-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{log.taskTitle}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {log.logDate} · <strong>{log.scorePct}%</strong>
                        </span>
                      </div>
                      <p className="text-muted-foreground">{log.description}</p>
                      <p className="text-emerald-600 font-medium">Feedback: {log.feedback}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── TAB 2: UPLOAD / PASTE ROADMAP ─────────────────────────────── */}
          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload or Paste Your Roadmap</CardTitle>
                <CardDescription>
                  Upload a PDF / Markdown / TXT file or paste any roadmap text. AI will convert it into sequential stages and tasks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-1.5 text-xs">
                  <span className="font-medium text-muted-foreground">Target Role / Goal</span>
                  <input
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                  />
                </label>

                <div className="rounded-xl border border-dashed border-border bg-background/50 p-5 text-center space-y-2">
                  <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Upload `.pdf`, `.md`, or `.txt` roadmap file
                  </p>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted">
                    {busy ? 'Parsing...' : 'Choose File'}
                    <input
                      type="file"
                      accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown"
                      disabled={busy}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-1.5 text-xs">
                  <span className="font-medium text-muted-foreground">Or paste roadmap text</span>
                  <textarea
                    rows={8}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste your C# / .NET / Automation roadmap stages & topics here..."
                    className="w-full rounded-lg border border-border bg-background p-3 text-xs focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={busy || pasteText.trim().length < 30}
                    onClick={handleImportText}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {busy ? 'Parsing Roadmap...' : 'Parse & Replace Roadmap'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {loading && !data && (
          <p className="py-12 text-center text-xs text-muted-foreground">Loading roadmap...</p>
        )}
      </main>
    </div>
  );
}
