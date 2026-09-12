'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GymOsSnapshot, GymTemplateExercise, GymWorkoutTemplate } from '@/lib/gym/types';
import styles from './gym-os.module.css';

type FormValue = string | number | boolean | null;

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', options ?? { month: 'short', day: 'numeric' });
}

function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function Progress({ value, tone = 'lime' }: { value: number; tone?: 'lime' | 'amber' | 'blue' }) {
  return <div className={styles.progressTrack}><span className={`${styles.progressFill} ${styles[tone]}`} style={{ width: `${clamp(value)}%` }} /></div>;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ActivityHeatmap({ snapshot, onSelect }: { snapshot: GymOsSnapshot; onSelect: (date: string) => void }) {
  const { weeks, monthLabels } = useMemo(() => {
    const selected = new Date(`${snapshot.date}T12:00:00`);
    const start = new Date(selected);
    start.setDate(start.getDate() - selected.getDay() - 52 * 7);
    const builtWeeks = Array.from({ length: 53 }, (_, weekIndex) => Array.from({ length: 7 }, (_, dayIndex) => {
      const day = new Date(start);
      day.setDate(start.getDate() + weekIndex * 7 + dayIndex);
      return { date: isoDate(day), month: day.getMonth(), day: day.getDate() };
    }));
    const labels: Array<{ week: number; label: string }> = [];
    builtWeeks.forEach((week, index) => {
      const firstOfMonth = week.find((day) => day.day <= 7);
      if (firstOfMonth && labels.at(-1)?.label !== new Date(`${firstOfMonth.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })) {
        labels.push({ week: index, label: new Date(`${firstOfMonth.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }) });
      }
    });
    return { weeks: builtWeeks, monthLabels: labels };
  }, [snapshot.date]);
  const activity = useMemo(() => new Map(snapshot.activity.map((day) => [day.date, day])), [snapshot.activity]);
  const activeDays = snapshot.activity.filter((day) => day.level > 0);
  const totalMinutes = activeDays.reduce((sum, day) => sum + day.durationMinutes, 0);
  const totalSets = activeDays.reduce((sum, day) => sum + day.workingSets, 0);
  const totalReps = activeDays.reduce((sum, day) => sum + day.totalReps, 0);

  return <section id="consistency" className={`${styles.card} ${styles.heatmapCard}`}>
    <div className={styles.cardHeaderCompact}>
      <div><span className={styles.eyebrow}>365-day execution record</span><h2>Gym consistency map</h2></div>
      <div className={styles.heatmapStats}><span><strong>{activeDays.length}</strong> active days</span><span><strong>{(totalMinutes / 60).toFixed(1)}</strong> hours</span><span><strong>{totalSets}</strong> sets</span><span><strong>{totalReps.toLocaleString()}</strong> reps</span></div>
    </div>
    <p className={styles.bodyCopy}>Color depth is evidence-weighted: completion 35%, training time 30%, working sets 25%, and reps 10%. A new square is added automatically each local day; select one to inspect its evidence.</p>
    <div className={styles.heatmapScroller}>
      <div className={styles.heatmapGrid} role="grid" aria-label="Gym activity during the last 365 days">
        {monthLabels.map((item) => <span key={`${item.week}-${item.label}`} className={styles.monthLabel} style={{ gridColumn: item.week + 2, gridRow: 1 }}>{item.label}</span>)}
        <span className={styles.dayLabel} style={{ gridColumn: 1, gridRow: 3 }}>Mon</span>
        <span className={styles.dayLabel} style={{ gridColumn: 1, gridRow: 5 }}>Wed</span>
        <span className={styles.dayLabel} style={{ gridColumn: 1, gridRow: 7 }}>Fri</span>
        {weeks.flatMap((week, weekIndex) => week.map((day, dayIndex) => {
          const record = activity.get(day.date);
          const future = day.date > snapshot.date;
          const title = record
            ? `${formatDate(day.date, { month: 'long', day: 'numeric', year: 'numeric' })} · ${record.status.replace('_', ' ')} · ${(record.durationMinutes / 60).toFixed(1)}h · ${record.workingSets} sets · ${record.totalReps} reps · score ${record.score}/100`
            : `${formatDate(day.date, { month: 'long', day: 'numeric', year: 'numeric' })} · No gym activity`;
          return <button key={day.date} type="button" className={`${styles.heatCell} ${day.date === snapshot.date ? styles.heatCellSelected : ''}`} data-level={future ? 0 : record?.level ?? 0} disabled={future} title={title} aria-label={title} style={{ gridColumn: weekIndex + 2, gridRow: dayIndex + 2 }} onClick={() => onSelect(day.date)} />;
        }))}
      </div>
    </div>
    <div className={styles.heatmapLegend}><span>Rest / no record</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}<span>Full execution</span></div>
  </section>;
}

function Field({ label, value, onChange, type = 'number', step = 'any', min, max, placeholder }: {
  label: string; value: FormValue; onChange: (value: string) => void; type?: string; step?: string; min?: number; max?: number; placeholder?: string;
}) {
  return <label className={styles.field}><span>{label}</span><input type={type} step={step} min={min} max={max} value={String(value ?? '')} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CheckInForm({ snapshot, busy, submit }: { snapshot: GymOsSnapshot; busy: boolean; submit: (body: Record<string, FormValue>) => Promise<boolean> }) {
  const profile = snapshot.profile;
  const existing = snapshot.todayCheckIn;
  const [form, setForm] = useState({
    weightKg: existing?.weightKg ?? '', calories: existing?.calories ?? '', proteinG: existing?.proteinG ?? '',
    carbsG: existing?.carbsG ?? '', fatG: existing?.fatG ?? '', waterL: existing?.waterL ?? '', steps: existing?.steps ?? '',
    sleepHours: existing?.sleepHours ?? '', mood: existing?.mood ?? 3, fatigue: existing?.fatigue ?? 3, pain: existing?.pain ?? 0,
    notes: existing?.notes ?? '',
  });
  useEffect(() => {
    setForm({
      weightKg: existing?.weightKg ?? '', calories: existing?.calories ?? '', proteinG: existing?.proteinG ?? '',
      carbsG: existing?.carbsG ?? '', fatG: existing?.fatG ?? '', waterL: existing?.waterL ?? '', steps: existing?.steps ?? '',
      sleepHours: existing?.sleepHours ?? '', mood: existing?.mood ?? 3, fatigue: existing?.fatigue ?? 3, pain: existing?.pain ?? 0,
      notes: existing?.notes ?? '',
    });
  }, [snapshot.date, existing]);
  const set = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  return <form className={styles.formStack} onSubmit={(event) => { event.preventDefault(); void submit({ action: 'save_checkin', date: snapshot.date, ...form }); }}>
    <div className={styles.formGrid}>
      <Field label="Morning weight (kg)" value={form.weightKg} onChange={(value) => set('weightKg', value)} />
      <Field label="Sleep (hours)" value={form.sleepHours} onChange={(value) => set('sleepHours', value)} />
      <Field label={`Calories / ${profile.calorieTarget}`} value={form.calories} onChange={(value) => set('calories', value)} />
      <Field label={`Protein / ${profile.proteinTargetG}g`} value={form.proteinG} onChange={(value) => set('proteinG', value)} />
      <Field label={`Carbs / ${profile.carbsTargetG}g`} value={form.carbsG} onChange={(value) => set('carbsG', value)} />
      <Field label={`Fat / ${profile.fatTargetG}g`} value={form.fatG} onChange={(value) => set('fatG', value)} />
      <Field label={`Water / ${profile.waterTargetL}L`} value={form.waterL} onChange={(value) => set('waterL', value)} />
      <Field label={`Steps / ${profile.stepsTarget}`} value={form.steps} onChange={(value) => set('steps', value)} step="1" />
      <Field label="Mood (1–5)" value={form.mood} min={1} max={5} onChange={(value) => set('mood', value)} />
      <Field label="Fatigue (1–5)" value={form.fatigue} min={1} max={5} onChange={(value) => set('fatigue', value)} />
      <Field label="Pain (0–10)" value={form.pain} min={0} max={10} onChange={(value) => set('pain', value)} />
    </div>
    <label className={styles.field}><span>Recovery notes</span><textarea rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Energy, soreness, neck/back status, sleep quality" /></label>
    <button className={styles.primaryButton} disabled={busy}>{busy ? 'Saving…' : existing ? 'Update daily check-in' : 'Save daily check-in'}</button>
  </form>;
}

function MeasurementForm({ snapshot, busy, submit, refresh }: { snapshot: GymOsSnapshot; busy: boolean; submit: (body: Record<string, FormValue>) => Promise<boolean>; refresh: () => Promise<void> }) {
  const [form, setForm] = useState({ weightKg: '', bodyFatPct: '', waistCm: '', chestCm: '', shouldersCm: '', leftBicepCm: '', rightBicepCm: '', notes: '' });
  const [photoView, setPhotoView] = useState('front');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function uploadPhoto() {
    if (!photo) return;
    setPhotoMessage('Saving locally…');
    const data = new FormData();
    data.set('date', snapshot.date); data.set('view', photoView); data.set('photo', photo);
    const response = await fetch('/api/gym/os/photo', { method: 'POST', body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Photo upload failed.');
    setPhoto(null); setPhotoMessage('Photo stored on this computer.');
    await refresh();
  }
  return <div className={styles.formStack}>
    <form className={styles.formStack} onSubmit={(event) => { event.preventDefault(); void submit({ action: 'save_measurement', date: snapshot.date, ...form }); }}>
      <div className={styles.formGrid}>
        <Field label="Weight (kg)" value={form.weightKg} onChange={(value) => set('weightKg', value)} />
        <Field label="Body fat estimate (%)" value={form.bodyFatPct} onChange={(value) => set('bodyFatPct', value)} />
        <Field label="Waist at navel (cm)" value={form.waistCm} onChange={(value) => set('waistCm', value)} />
        <Field label="Chest (cm)" value={form.chestCm} onChange={(value) => set('chestCm', value)} />
        <Field label="Shoulder circumference (cm)" value={form.shouldersCm} onChange={(value) => set('shouldersCm', value)} />
        <Field label="Left biceps flexed (cm)" value={form.leftBicepCm} onChange={(value) => set('leftBicepCm', value)} />
        <Field label="Right biceps flexed (cm)" value={form.rightBicepCm} onChange={(value) => set('rightBicepCm', value)} />
      </div>
      <label className={styles.field}><span>Measurement notes</span><textarea rows={2} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
      <button className={styles.secondaryButton} disabled={busy}>Save weekly measurements</button>
    </form>
    <div className={styles.photoRow}>
      <label className={styles.field}><span>Progress-photo view</span><select value={photoView} onChange={(event) => setPhotoView(event.target.value)}><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option></select></label>
      <label className={styles.fileField}><span>Private photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label>
      <button type="button" className={styles.ghostButton} disabled={!photo} onClick={() => void uploadPhoto().catch((error) => setPhotoMessage(error.message))}>Store privately</button>
    </div>
    <p className={styles.microcopy}>{photoMessage || `${snapshot.progressPhotoCount} private progress photos stored in protected app storage.`}</p>
  </div>;
}

function PlanEditor({ snapshot, busy, submit }: { snapshot: GymOsSnapshot; busy: boolean; submit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const templates = useMemo(() => snapshot.templates, [snapshot.templates]);
  const [selected, setSelected] = useState(templates.find((item) => item.weekday !== 0)?.id ?? templates[0]?.id ?? '');
  const active = templates.find((item) => item.id === selected) ?? templates[0];
  const [exercises, setExercises] = useState<GymTemplateExercise[]>(active?.exercises ?? []);
  useEffect(() => setExercises(active?.exercises.map((item) => ({ ...item })) ?? []), [active]);
  if (!active) return null;
  const update = (index: number, key: keyof GymTemplateExercise, value: string | number) => setExercises((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: typeof item[key] === 'number' ? Number(value) : value } : item));
  return <div className={styles.planEditor}>
    <div className={styles.planTabs}>{templates.map((template) => <button key={template.id} className={template.id === active.id ? styles.planTabActive : styles.planTab} onClick={() => setSelected(template.id)}>{template.shortName}</button>)}</div>
    <div className={styles.editorHeading}><div><strong>{active.name}</strong><span>{active.focus}</span></div><button className={styles.ghostButton} onClick={() => setExercises((current) => [...current, { id: '', name: '', muscleGroup: 'General', order: current.length + 1, targetSets: 3, minReps: 10, maxReps: 15, restSeconds: 90 }])}>Add exercise</button></div>
    <div className={styles.editorRows}>{exercises.map((exercise, index) => <div className={styles.editorRow} key={`${exercise.id}-${index}`}>
      <span className={styles.order}>{index + 1}</span>
      <input aria-label="Exercise name" value={exercise.name} onChange={(event) => update(index, 'name', event.target.value)} />
      <input aria-label="Muscle group" value={exercise.muscleGroup} onChange={(event) => update(index, 'muscleGroup', event.target.value)} />
      <input aria-label="Sets" type="number" min={1} max={10} value={exercise.targetSets} onChange={(event) => update(index, 'targetSets', event.target.value)} />
      <input aria-label="Minimum reps" type="number" min={1} max={120} value={exercise.minReps} onChange={(event) => update(index, 'minReps', event.target.value)} />
      <input aria-label="Maximum reps" type="number" min={1} max={120} value={exercise.maxReps} onChange={(event) => update(index, 'maxReps', event.target.value)} />
      <button aria-label={`Remove ${exercise.name}`} className={styles.removeButton} onClick={() => setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
    </div>)}</div>
    <button className={styles.secondaryButton} disabled={busy || active.weekday === 0} onClick={() => void submit({ action: 'save_template', date: snapshot.date, templateId: active.id, exercises })}>Save {active.name} template</button>
  </div>;
}

function GoalEditor({ snapshot, busy, submit }: { snapshot: GymOsSnapshot; busy: boolean; submit: (body: Record<string, FormValue>) => Promise<boolean> }) {
  const profile = snapshot.profile;
  const [form, setForm] = useState({ ...profile });
  useEffect(() => setForm({ ...profile }), [profile]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <details className={styles.goalEditor}><summary>Edit targets</summary><form className={styles.formStack} onSubmit={(event) => { event.preventDefault(); void submit({ action: 'save_profile', date: snapshot.date, ...form }); }}>
    <div className={styles.formGrid}>
      <Field label="Current weight" value={form.currentWeightKg} onChange={(value) => set('currentWeightKg', value)} />
      <Field label="Target weight" value={form.targetWeightKg} onChange={(value) => set('targetWeightKg', value)} />
      <Field label="Current body fat" value={form.currentBodyFatPct} onChange={(value) => set('currentBodyFatPct', value)} />
      <Field label="Target body fat" value={form.targetBodyFatPct} onChange={(value) => set('targetBodyFatPct', value)} />
      <Field label="Target date" type="date" value={form.targetDate} onChange={(value) => set('targetDate', value)} />
      <Field label="Training time" type="time" value={form.trainingStartTime} onChange={(value) => set('trainingStartTime', value)} />
      <Field label="Session minutes" value={form.sessionMinutes} onChange={(value) => set('sessionMinutes', value)} />
      <Field label="Calories" value={form.calorieTarget} onChange={(value) => set('calorieTarget', value)} />
      <Field label="Protein (g)" value={form.proteinTargetG} onChange={(value) => set('proteinTargetG', value)} />
      <Field label="Carbs (g)" value={form.carbsTargetG} onChange={(value) => set('carbsTargetG', value)} />
      <Field label="Fat (g)" value={form.fatTargetG} onChange={(value) => set('fatTargetG', value)} />
      <Field label="Water (L)" value={form.waterTargetL} onChange={(value) => set('waterTargetL', value)} />
      <Field label="Steps" value={form.stepsTarget} onChange={(value) => set('stepsTarget', value)} />
    </div><button className={styles.secondaryButton} disabled={busy}>Save targets</button>
  </form></details>;
}

function GymReminderPanel({ snapshot, busy, submit }: { snapshot: GymOsSnapshot; busy: boolean; submit: (body: Record<string, FormValue>) => Promise<boolean> }) {
  const reminders = snapshot.reminders;
  const restDay = snapshot.todayTemplate.weekday === 0;
  const [enabled, setEnabled] = useState(reminders.enabled);
  const [recipientEmail, setRecipientEmail] = useState(reminders.recipientEmail);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  useEffect(() => {
    setEnabled(reminders.enabled);
    setRecipientEmail(reminders.recipientEmail);
  }, [reminders.enabled, reminders.recipientEmail]);
  async function sendTest() {
    setTesting(true); setTestMessage('Sending workout briefing…');
    try {
      const response = await fetch('/api/gym/reminders/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: snapshot.date }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Test email failed.');
      setTestMessage(`Sent to ${result.recipient} using ${result.provider}.`);
    } catch (testError) {
      setTestMessage(testError instanceof Error ? testError.message : 'Test email failed.');
    } finally { setTesting(false); }
  }
  return <section id="reminders" className={`${styles.card} ${styles.reminderCard}`}>
    <div className={styles.cardHeaderCompact}><div><span className={styles.eyebrow}>Automated accountability</span><h2>Gym email sequence</h2></div><span className={restDay ? styles.statusAmber : enabled ? styles.statusLime : styles.statusAmber}>{restDay ? 'Recovery day' : enabled ? 'Armed' : 'Paused'}</span></div>
    <p className={styles.bodyCopy}>{restDay ? 'Sunday is protected recovery. No training emails or Builder task are created.' : 'Six duplicate-safe emails follow the live workout record. The workout also appears as a 9:00–10:30 PM Builder task in Daily Command and syncs to Google when connected.'}</p>
    <div className={styles.reminderTimeline}>{reminders.schedule.map((item) => {
      const delivery = reminders.deliveries.find((entry) => entry.slot === item.slot);
      return <div key={item.slot} className={styles.reminderStep}><time>{formatTime(item.time)}</time><span><strong>{item.label}</strong><small>{item.purpose}</small></span><i data-state={delivery?.status ?? 'waiting'}>{delivery?.status ?? 'waiting'}</i></div>;
    })}</div>
    <div className={styles.reminderControls}>
      <label className={styles.checkField}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable gym sequence</span></label>
      <Field label="Reminder email" type="email" value={recipientEmail} onChange={setRecipientEmail} />
      <button className={styles.secondaryButton} disabled={busy || !recipientEmail.trim()} onClick={() => void submit({ action: 'save_gym_reminders', date: snapshot.date, enabled, recipientEmail })}>Save sequence</button>
      <button className={styles.ghostButton} disabled={testing || !enabled || restDay} onClick={() => void sendTest()}>{testing ? 'Sending…' : 'Send test briefing'}</button>
    </div>
    <p className={styles.microcopy}>{testMessage || `Timezone: ${reminders.timezone} · Gmail first · Resend fallback · scheduler worker required`}</p>
  </section>;
}

export default function GymOS() {
  const [date, setDate] = useState(todayLocal());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const observedToday = useRef(todayLocal());
  const [snapshot, setSnapshot] = useState<GymOsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [prePain, setPrePain] = useState('0');
  const [setForms, setSetForms] = useState<Record<string, { weightKg: string; reps: string; rir: string; pain: string; warmup: boolean }>>({});
  const [finish, setFinish] = useState({ durationMinutes: '90', postPain: '0', postFatigue: '3', notes: '' });
  const [draggedDate, setDraggedDate] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/gym/os?date=${date}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load Gym OS.');
      setSnapshot(result);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load Gym OS.'); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const saved = window.localStorage.getItem('vira-gym-theme');
    if (saved === 'dark' || saved === 'light') setTheme(saved);
    else if (window.matchMedia('(prefers-color-scheme: light)').matches) setTheme('light');
  }, []);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  useEffect(() => {
    const dayTimer = window.setInterval(() => {
      const latestToday = todayLocal();
      const previousToday = observedToday.current;
      if (latestToday === previousToday) return;
      setDate((current) => current === previousToday ? latestToday : current);
      observedToday.current = latestToday;
    }, 30_000);
    return () => window.clearInterval(dayTimer);
  }, []);

  async function submit(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/gym/os', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Update failed.');
      setSnapshot(result); setMessage('Saved to Gym OS.');
      return true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Update failed.');
      return false;
    }
    finally { setBusy(false); }
  }

  if (loading && !snapshot) return <main className={styles.loading}>Loading Gym OS…</main>;
  if (!snapshot) return <main className={styles.loading}>{error || 'Gym OS is unavailable.'}</main>;

  const profile = snapshot.profile;
  const totalTargetSets = snapshot.todayTemplate.exercises.reduce((sum, item) => sum + item.targetSets, 0);
  const loggedWorkingSets = snapshot.todaySession?.sets.filter((item) => !item.warmup).length ?? 0;
  const sessionProgress = totalTargetSets ? loggedWorkingSets / totalTargetSets * 100 : 0;
  const latestWeight = snapshot.trends.weeklyAverageWeight ?? snapshot.todayCheckIn?.weightKg ?? profile.currentWeightKg;
  const weightProgress = profile.currentWeightKg === profile.targetWeightKg ? 100 : (profile.currentWeightKg - latestWeight) / (profile.currentWeightKg - profile.targetWeightKg) * 100;
  const daysLeft = Math.max(0, Math.ceil((new Date(`${profile.targetDate}T12:00:00`).getTime() - new Date(`${snapshot.date}T12:00:00`).getTime()) / 86_400_000));
  const latestMeasurement = snapshot.measurements[0];
  const taperRatio = latestMeasurement?.shouldersCm && latestMeasurement?.waistCm ? latestMeasurement.shouldersCm / latestMeasurement.waistCm : null;
  const macroCalories = profile.proteinTargetG * 4 + profile.carbsTargetG * 4 + profile.fatTargetG * 9;
  const painLevel = snapshot.todayCheckIn?.pain ?? snapshot.todaySession?.prePain ?? 0;

  const formFor = (exercise: GymTemplateExercise) => setForms[exercise.id] ?? { weightKg: '', reps: String(exercise.minReps), rir: '2', pain: '0', warmup: false };
  const updateSetForm = (exercise: GymTemplateExercise, key: string, value: string | boolean) => setSetForms((current) => ({ ...current, [exercise.id]: { ...formFor(exercise), [key]: value } }));
  async function swapDays(targetDate: string) {
    if (!snapshot || !draggedDate || draggedDate === targetDate || busy) return;
    const source = snapshot.week.find((day) => day.date === draggedDate);
    const target = snapshot.week.find((day) => day.date === targetDate);
    if (!source || !target) return;
    const saved = await submit({ action: 'swap_schedule', date: snapshot.date, firstDate: source.date, secondDate: target.date, firstTemplateId: source.template.id, secondTemplateId: target.template.id });
    if (saved) setMessage(`${source.weekday} and ${target.weekday} swapped. Schedule saved.`);
    setDraggedDate(null); setDropDate(null);
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('vira-gym-theme', next);
  }

  return <main className={styles.shell} data-theme={theme}>
    <header className={styles.header}>
      <div className={styles.brand}><Link href="/">Operator</Link><span>/</span><strong>Gym OS</strong></div>
      <nav className={styles.nav}><a href="#today">Today</a><a href="#consistency">Consistency</a><a href="#reminders">Reminders</a><a href="#checkin">Check-in</a><a href="#progress">Progress</a><a href="#plan">Plan</a></nav>
      <div className={styles.headerActions}>
        <button type="button" className={styles.themeSwitch} onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'light'}>
          <span className={styles.themeTrack}><i /></span><b>{theme === 'dark' ? 'Dark' : 'Light'}</b>
        </button>
        <div className={styles.headerDate}><input aria-label="Selected training date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      </div>
    </header>

    <div className={styles.workspace}>
      {(message || error) && <div className={error ? styles.errorBanner : styles.successBanner}>{error || message}</div>}

      <section className={styles.commandStrip}>
        <div><span className={styles.eyebrow}>Primary objective</span><h1>75 kg at 12–13% body fat</h1><p>Upper chest, capped delts, V-taper, defined arms and visible abs.</p></div>
        <div className={styles.goalMetric}><span>{latestWeight.toFixed(1)} kg</span><small>{daysLeft} days to {formatDate(profile.targetDate, { month: 'short', day: 'numeric' })}</small><Progress value={weightProgress} /></div>
        <div className={styles.goalMetric}><span>{taperRatio ? taperRatio.toFixed(2) : '—'}</span><small>Shoulder-to-waist ratio</small><Progress value={taperRatio ? taperRatio / 1.6 * 100 : 0} tone="blue" /></div>
        <GoalEditor snapshot={snapshot} busy={busy} submit={submit} />
      </section>

      <section className={styles.weekSection} aria-label="Training week">
        <div className={styles.weekSectionHeader}><div><span className={styles.eyebrow}>Weekly command rail</span><p>Drag any day onto another to swap the workout. The change is saved for those dates.</p></div><span className={styles.dragLegend}>↔ DRAG TO SWAP</span></div>
        <div className={styles.weekRail}>
        {snapshot.week.map((day) => <button key={day.date} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggedDate(day.date); }} onDragOver={(event) => { event.preventDefault(); setDropDate(day.date); }} onDragLeave={() => setDropDate((current) => current === day.date ? null : current)} onDrop={(event) => { event.preventDefault(); void swapDays(day.date); }} onDragEnd={() => { setDraggedDate(null); setDropDate(null); }} onClick={() => setDate(day.date)} className={`${styles.weekDay} ${day.date === snapshot.date ? styles.weekDayActive : ''} ${draggedDate === day.date ? styles.weekDayDragging : ''} ${dropDate === day.date && draggedDate !== day.date ? styles.weekDayDrop : ''}`} style={{ '--accent': day.template.accent } as React.CSSProperties} aria-label={`${day.weekday} ${day.template.name}. Drag to swap this workout.`} title="Drag this day onto another day to swap workouts">
          <span>{day.weekday}</span><strong>{day.template.shortName}</strong><small>{formatDate(day.date)}</small><b className={styles.dragMark}>↔</b><i data-status={day.sessionStatus ?? 'planned'} />
        </button>)}
        </div>
      </section>

      <ActivityHeatmap snapshot={snapshot} onSelect={setDate} />

      <div className={styles.mainGrid}>
        <section id="today" className={`${styles.card} ${styles.trainingCard}`}>
          <div className={styles.cardHeader}><div><span className={styles.eyebrow}>{formatDate(snapshot.date, { weekday: 'long', month: 'long', day: 'numeric' })}</span><h2>{snapshot.todayTemplate.name}</h2><p>{snapshot.todayTemplate.focus}</p></div><div className={styles.sessionMeta}><span>{formatTime(profile.trainingStartTime)}</span><small>{profile.sessionMinutes} minutes</small></div></div>
          {painLevel >= 3 && <div className={styles.caution}>Pain is {painLevel}/10. Record every set and stop the movement if pain increases.</div>}
          {snapshot.todayTemplate.weekday === 0 ? <div className={styles.restBlock}><strong>Recovery day</strong><span>Measurements, mobility, meal preparation and sleep.</span></div> : <>
            <div className={styles.sessionProgress}><div><span>Working sets</span><strong>{loggedWorkingSets}/{totalTargetSets}</strong></div><Progress value={sessionProgress} /></div>
            {!snapshot.todaySession && <div className={styles.startRow}><Field label="Pain before training (0–10)" value={prePain} min={0} max={10} onChange={setPrePain} /><button className={styles.primaryButton} disabled={busy} onClick={() => void submit({ action: 'start_session', date: snapshot.date, templateId: snapshot.todayTemplate.id, prePain })}>Start session</button></div>}
            <div className={styles.exerciseList}>{snapshot.todayTemplate.exercises.map((exercise) => {
              const logged = snapshot.todaySession?.sets.filter((item) => item.exerciseId === exercise.id || item.exerciseName === exercise.name) ?? [];
              const form = formFor(exercise);
              return <article className={styles.exercise} key={exercise.id}>
                <div className={styles.exerciseTitle}><span>{String(exercise.order).padStart(2, '0')}</span><div><h3>{exercise.name}</h3><p>{exercise.muscleGroup} · {exercise.targetSets} sets · {exercise.minReps}–{exercise.maxReps} reps · {exercise.restSeconds}s rest</p></div><strong>{logged.filter((set) => !set.warmup).length}/{exercise.targetSets}</strong></div>
                {logged.length > 0 && <div className={styles.loggedSets}>{logged.map((set) => <div key={set.id}><span>S{set.setNumber}</span><b>{set.weightKg}kg × {set.reps}</b><small>RIR {set.rir} · pain {set.pain}</small><button onClick={() => void submit({ action: 'delete_set', date: snapshot.date, setId: set.id })}>Remove</button></div>)}</div>}
                <div className={styles.setEntry}>
                  <Field label="kg" value={form.weightKg} onChange={(value) => updateSetForm(exercise, 'weightKg', value)} />
                  <Field label="Reps" value={form.reps} onChange={(value) => updateSetForm(exercise, 'reps', value)} />
                  <Field label="RIR" value={form.rir} min={0} max={10} onChange={(value) => updateSetForm(exercise, 'rir', value)} />
                  <Field label="Pain" value={form.pain} min={0} max={10} onChange={(value) => updateSetForm(exercise, 'pain', value)} />
                  <label className={styles.checkField}><input type="checkbox" checked={form.warmup} onChange={(event) => updateSetForm(exercise, 'warmup', event.target.checked)} /><span>Warm-up</span></label>
                  <button className={styles.logButton} disabled={busy} onClick={() => void submit({ action: 'log_set', date: snapshot.date, exerciseId: exercise.id, ...form }).then((saved) => {
                    if (saved) setSetForms((current) => ({ ...current, [exercise.id]: { ...form, reps: String(exercise.minReps) } }));
                  })}>Log set</button>
                </div>
              </article>;
            })}</div>
            {snapshot.todaySession && snapshot.todaySession.status !== 'completed' && <div className={styles.finishBlock}><h3>Close session</h3><div className={styles.formGrid}><Field label="Duration (minutes)" value={finish.durationMinutes} onChange={(value) => setFinish({ ...finish, durationMinutes: value })} /><Field label="Pain after (0–10)" value={finish.postPain} min={0} max={10} onChange={(value) => setFinish({ ...finish, postPain: value })} /><Field label="Mental fatigue (1–5)" value={finish.postFatigue} min={1} max={5} onChange={(value) => setFinish({ ...finish, postFatigue: value })} /></div><textarea rows={2} placeholder="What changed during the session?" value={finish.notes} onChange={(event) => setFinish({ ...finish, notes: event.target.value })} /><button className={styles.primaryButton} onClick={() => void submit({ action: 'finish_session', date: snapshot.date, ...finish })}>Complete session</button></div>}
          </>}
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.card}><div className={styles.cardHeaderCompact}><div><span className={styles.eyebrow}>Today</span><h2>Readiness</h2></div><span className={painLevel >= 3 ? styles.statusAmber : styles.statusLime}>{snapshot.todayCheckIn ? 'Logged' : 'Waiting'}</span></div>
            <div className={styles.readinessGrid}><div><span>Sleep</span><strong>{snapshot.todayCheckIn?.sleepHours ?? '—'}h</strong></div><div><span>Fatigue</span><strong>{snapshot.todayCheckIn?.fatigue ?? '—'}/5</strong></div><div><span>Pain</span><strong>{painLevel || '—'}/10</strong></div><div><span>Steps</span><strong>{snapshot.todayCheckIn?.steps?.toLocaleString() ?? '—'}</strong></div></div>
          </section>
          <section className={styles.card}><span className={styles.eyebrow}>Nutrition constraint</span><h2>Protein without powder</h2><p className={styles.bodyCopy}>Build the 165 g target from eggs, milk, soybeans, rajma and dal this month. Log totals, not guesses.</p><div className={styles.targetList}><div><span>Protein</span><b>{snapshot.todayCheckIn?.proteinG ?? 0} / {profile.proteinTargetG}g</b></div><Progress value={(snapshot.todayCheckIn?.proteinG ?? 0) / profile.proteinTargetG * 100} /><div><span>Calories</span><b>{snapshot.todayCheckIn?.calories ?? 0} / {profile.calorieTarget}</b></div><Progress value={(snapshot.todayCheckIn?.calories ?? 0) / profile.calorieTarget * 100} tone="amber" /></div><p className={styles.microcopy}>{profile.calorieTarget - macroCalories} kcal remain flexible because the entered macros total {macroCalories.toLocaleString()} kcal.</p></section>
          <section className={styles.card}><span className={styles.eyebrow}>This week</span><h2>Execution</h2><div className={styles.statRow}><div><strong>{snapshot.trends.completedThisWeek}/{snapshot.trends.plannedThisWeek}</strong><span>sessions</span></div><div><strong>{Math.round(snapshot.trends.totalVolumeKg).toLocaleString()}</strong><span>kg volume</span></div><div><strong>{snapshot.trends.streak}</strong><span>day streak</span></div></div></section>
        </aside>
      </div>

      <GymReminderPanel snapshot={snapshot} busy={busy} submit={submit} />

      <section id="checkin" className={styles.twoColumn}>
        <article className={styles.card}><div className={styles.cardHeaderCompact}><div><span className={styles.eyebrow}>Daily inputs</span><h2>Body and recovery check-in</h2></div><small>About 60 seconds</small></div><CheckInForm snapshot={snapshot} busy={busy} submit={submit} /></article>
        <article className={styles.card}><div className={styles.cardHeaderCompact}><div><span className={styles.eyebrow}>Every Sunday</span><h2>Measurements and photos</h2></div><small>Same conditions each week</small></div><MeasurementForm snapshot={snapshot} busy={busy} submit={submit} refresh={load} /></article>
      </section>

      <section id="progress" className={styles.twoColumn}>
        <article className={styles.card}><span className={styles.eyebrow}>Weight trend</span><div className={styles.cardHeaderCompact}><h2>Seven-day signal</h2><strong>{snapshot.trends.weeklyAverageWeight ? `${snapshot.trends.weeklyAverageWeight.toFixed(1)} kg` : 'No check-ins yet'}</strong></div><div className={styles.weightChart}>{snapshot.trends.weight.length ? snapshot.trends.weight.map((point) => <div key={point.date}><span style={{ height: `${clamp(32 + (point.value - profile.targetWeightKg) * 9, 12, 100)}%` }} /><small>{formatDate(point.date, { day: 'numeric' })}</small></div>) : <p>Log morning weight to build the trend.</p>}</div></article>
        <article className={styles.card}><span className={styles.eyebrow}>Performance</span><h2>Estimated strength records</h2>{snapshot.personalRecords.length ? <div className={styles.prList}>{snapshot.personalRecords.map((record) => <div key={record.exerciseName}><span>{record.exerciseName}</span><strong>{record.weightKg}kg × {record.reps}</strong><small>e1RM {record.estimatedOneRepMax.toFixed(1)}kg · {formatDate(record.date)}</small></div>)}</div> : <div className={styles.emptyState}>Working-set PRs appear after you begin logging.</div>}</article>
      </section>

      <section id="plan" className={styles.card}><div className={styles.cardHeaderCompact}><div><span className={styles.eyebrow}>Editable system</span><h2>Weekly training plan</h2></div><small>Compounds 4 sets · isolation 3 sets</small></div><PlanEditor snapshot={snapshot} busy={busy} submit={submit} /></section>

      <footer className={styles.footer}><span>SQLite is now the source of truth.</span><span>{snapshot.migration.importedDays} legacy Excel days migrated.</span><span>Private files: this device only.</span></footer>
    </div>
  </main>;
}
