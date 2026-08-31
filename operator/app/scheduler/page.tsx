'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PersonalityId,
  PersonalityMode,
  ReminderChannel,
  SchedulerSettings,
  SchedulerSnapshot,
  SchedulerTask,
  TaskStatus,
} from '@/lib/scheduler/types';
import type { GoogleAgendaSnapshot, GoogleConnectionStatus, GoogleSyncResult } from '@/lib/google/types';
import styles from './scheduler.module.css';

const MODE_CLASS: Record<PersonalityId, string> = {
  home: styles.modeHome,
  builder: styles.modeBuilder,
  free: styles.modeFree,
};

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function prettyDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function scheduledIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatGoogleDateTime(value: string): string {
  if (!value) return 'Time unavailable';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'All day';
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function addMinutes24(time: string, amount: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const next = (hours * 60 + minutes + amount) % (24 * 60);
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

type Period = 'AM' | 'PM';

function timeParts(time: string): { hour: number; minute: number; period: Period } {
  const [hours, minute] = time.split(':').map(Number);
  return { hour: hours % 12 || 12, minute, period: hours >= 12 ? 'PM' : 'AM' };
}

function to24Hour(hour: number, minute: number, period: Period): string {
  const hours = period === 'PM' ? (hour % 12) + 12 : hour % 12;
  return `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);

function Time12Field({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  const { hour, minute, period } = timeParts(value);
  return (
    <label className={wide ? styles.fieldWide : styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.timePicker}>
        <select className={styles.timeSelect} aria-label={`${label} hour`} value={hour} onChange={(event) => onChange(to24Hour(Number(event.target.value), minute, period))}>
          {HOUR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span className={styles.timeColon}>:</span>
        <select className={styles.timeSelect} aria-label={`${label} minute`} value={minute} onChange={(event) => onChange(to24Hour(hour, Number(event.target.value), period))}>
          {MINUTE_OPTIONS.map((option) => <option key={option} value={option}>{String(option).padStart(2, '0')}</option>)}
        </select>
        <select className={`${styles.timeSelect} ${styles.periodSelect}`} aria-label={`${label} AM or PM`} value={period} onChange={(event) => onChange(to24Hour(hour, minute, event.target.value as Period))}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </span>
    </label>
  );
}

function isTaskActive(task: SchedulerTask, now: Date): boolean {
  if (task.status !== 'planned') return false;
  const start = new Date(task.scheduledAt).getTime();
  const end = task.endTime
    ? new Date(`${task.taskDate}T${task.endTime}:00`).getTime()
    : start + 60 * 60_000;
  return now.getTime() >= start && now.getTime() < end;
}

type TaskForm = {
  title: string;
  details: string;
  startTime: string;
  endTime: string;
  personalityId: PersonalityId;
  priority: 1 | 2 | 3;
  reminderMinutes: number;
  reminderChannel: ReminderChannel;
};

const EMPTY_FORM: TaskForm = {
  title: '',
  details: '',
  startTime: '09:00',
  endTime: '10:00',
  personalityId: 'builder',
  priority: 2,
  reminderMinutes: 15,
  reminderChannel: 'both',
};

export default function SchedulerPage() {
  const [selectedDate, setSelectedDate] = useState('');
  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [now, setNow] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState('');
  const [checkInEnabled, setCheckInEnabled] = useState(true);
  const [checkInStartTime, setCheckInStartTime] = useState('08:00');
  const [checkInEndTime, setCheckInEndTime] = useState('22:00');
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [googleAgenda, setGoogleAgenda] = useState<GoogleAgendaSnapshot | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/scheduler?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to load scheduler.');
      const nextSnapshot = body as SchedulerSnapshot;
      setSnapshot(nextSnapshot);
      setEmail(nextSnapshot.settings.reminderEmail);
      setCheckInEnabled(nextSnapshot.settings.checkInEnabled);
      setCheckInStartTime(nextSnapshot.settings.checkInStartTime);
      setCheckInEndTime(nextSnapshot.settings.checkInEndTime);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load scheduler.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGoogle = useCallback(async (date: string) => {
    try {
      const statusResponse = await fetch('/api/google/status', { cache: 'no-store' });
      const statusBody = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(statusBody.error ?? 'Failed to load Google status.');
      const status = statusBody as GoogleConnectionStatus;
      setGoogleStatus(status);
      if (!status.connected) {
        setGoogleAgenda(null);
        return;
      }
      const agendaResponse = await fetch(`/api/google/agenda?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const agendaBody = await agendaResponse.json();
      if (!agendaResponse.ok) throw new Error(agendaBody.error ?? 'Failed to load Google agenda.');
      setGoogleAgenda(agendaBody as GoogleAgendaSnapshot);
    } catch (googleError) {
      console.error('[scheduler/google]', googleError);
      setGoogleAgenda(null);
    }
  }, []);

  useEffect(() => {
    setSelectedDate(localDateKey());
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selectedDate) load(selectedDate);
  }, [load, selectedDate]);
  useEffect(() => {
    if (selectedDate) loadGoogle(selectedDate);
  }, [loadGoogle, selectedDate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get('google');
    if (googleResult === 'connected') setSuccess('Google connected. Calendar, Tasks, and Gmail sync are active.');
    if (googleResult === 'wrong-account') setError('Wrong Google account selected. Connect the exact account shown in Google Command Center.');
    if (googleResult === 'error') setError('Google connection failed. Check the OAuth setup and try again.');
    if (googleResult) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('vira-browser-reminders');
    if (raw) {
      try { notifiedRef.current = new Set(JSON.parse(raw) as string[]); } catch { notifiedRef.current = new Set(); }
    }
  }, []);

  const tasks = snapshot?.tasks ?? [];
  const personalities = snapshot?.personalities ?? [];
  const personalityMap = useMemo(
    () => Object.fromEntries(personalities.map((mode) => [mode.id, mode])) as Partial<Record<PersonalityId, PersonalityMode>>,
    [personalities]
  );

  useEffect(() => {
    if (!now || !snapshot?.settings.browserEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const task of tasks) {
      if (task.status !== 'planned' || !['in_app', 'both'].includes(task.reminderChannel)) continue;
      const key = `${task.id}:${task.scheduledAt}`;
      if (notifiedRef.current.has(key)) continue;
      const scheduled = new Date(task.scheduledAt).getTime();
      const trigger = scheduled - task.reminderMinutes * 60_000;
      if (now.getTime() >= trigger && now.getTime() <= scheduled + 5 * 60_000) {
        const mode = personalityMap[task.personalityId];
        const notification = new Notification(`${formatTime12(task.startTime)} — ${task.title}`, {
          body: `${mode?.shortName ?? 'VIRA'}: ${mode?.identityStatement ?? 'Your scheduled task is ready.'}`,
          tag: key,
        });
        notification.onclick = () => window.focus();
        notifiedRef.current.add(key);
        window.localStorage.setItem('vira-browser-reminders', JSON.stringify([...notifiedRef.current]));
      }
    }
  }, [now, personalityMap, snapshot?.settings.browserEnabled, tasks]);

  const activeTask = now && selectedDate === localDateKey()
    ? tasks.find((task) => isTaskActive(task, now)) ?? null
    : null;
  const nextTask = now && selectedDate === localDateKey()
    ? tasks.find((task) => task.status === 'planned' && new Date(task.scheduledAt).getTime() > now.getTime()) ?? null
    : tasks.find((task) => task.status === 'planned') ?? null;
  const focusTask = activeTask ?? nextTask;
  const focusMode = focusTask ? personalityMap[focusTask.personalityId] : null;

  async function createTask(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/scheduler/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          taskDate: selectedDate,
          endTime: form.endTime || null,
          scheduledAt: scheduledIso(selectedDate, form.startTime),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to save task.');
      const googleSync = body.googleSync as GoogleSyncResult | undefined;
      setForm((current) => {
        const startTime = current.endTime || current.startTime;
        return { ...EMPTY_FORM, startTime, endTime: addMinutes24(startTime, 60) };
      });
      const synced = googleSync?.calendar === 'synced' || googleSync?.tasks === 'synced';
      setSuccess(synced ? 'Task saved and synced with Google.' : 'Task saved to the scheduler database.');
      if (googleSync?.error) setError(`Task saved locally. Google sync needs attention: ${googleSync.error}`);
      await Promise.all([load(selectedDate), loadGoogle(selectedDate)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(task: SchedulerTask, status: TaskStatus) {
    setError('');
    setSuccess('');
    const response = await fetch(`/api/scheduler/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Failed to update task.');
      return;
    }
    const googleSync = body.googleSync as GoogleSyncResult | undefined;
    if (googleSync?.error) setError(`Status saved locally. Google sync needs attention: ${googleSync.error}`);
    else if (googleSync?.calendar === 'synced' || googleSync?.tasks === 'synced') setSuccess('Status updated in VIRA and Google.');
    await Promise.all([load(selectedDate), loadGoogle(selectedDate)]);
  }

  async function updateTaskMode(task: SchedulerTask, personalityId: PersonalityId) {
    if (personalityId === task.personalityId) return;
    setUpdatingTaskId(task.id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/scheduler/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalityId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to change task mode.');
      const googleSync = body.googleSync as GoogleSyncResult | undefined;
      await Promise.all([load(selectedDate), loadGoogle(selectedDate)]);
      if (googleSync?.error) setError(`Mode changed locally. Google sync needs attention: ${googleSync.error}`);
      else setSuccess(`Mode changed to ${personalityMap[personalityId]?.shortName ?? personalityId}.`);
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : 'Failed to change task mode.');
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function removeTask(task: SchedulerTask) {
    if (!window.confirm(`Delete “${task.title}” from ${task.taskDate}?`)) return;
    const response = await fetch(`/api/scheduler/tasks/${task.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'Failed to delete task.');
      return;
    }
    await Promise.all([load(selectedDate), loadGoogle(selectedDate)]);
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/scheduler/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminderEmail: email,
          emailEnabled: true,
          checkInEnabled,
          checkInIntervalHours: 2,
          checkInStartTime,
          checkInEndTime,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to save reminder account.');
      setSuccess(checkInEnabled ? 'Email saved. Two-hour focus check-ins are active.' : 'Reminder settings saved.');
      await load(selectedDate);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Failed to save reminder account.');
    } finally {
      setSaving(false);
    }
  }

  async function enableBrowserReminders() {
    if (typeof Notification === 'undefined') {
      setError('This browser does not support desktop notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setError('Browser notifications were not enabled. You can change this in browser site settings.');
      return;
    }
    await fetch('/api/scheduler/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserEnabled: true }),
    });
    setSuccess('Browser reminders enabled for this device.');
    await load(selectedDate);
  }

  async function updateGooglePreference(
    key: 'calendarSyncEnabled' | 'tasksSyncEnabled' | 'gmailSendEnabled',
    value: boolean
  ) {
    setGoogleBusy(true);
    setError('');
    try {
      const response = await fetch('/api/google/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to update Google preferences.');
      setGoogleStatus(body as GoogleConnectionStatus);
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Failed to update Google preferences.');
    } finally {
      setGoogleBusy(false);
    }
  }

  async function syncGoogleNow() {
    setGoogleBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Google sync failed.');
      setSuccess(`Google sync complete: ${body.synced} task${body.synced === 1 ? '' : 's'} updated${body.failed ? `, ${body.failed} failed` : ''}.`);
      await loadGoogle(selectedDate);
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google sync failed.');
    } finally {
      setGoogleBusy(false);
    }
  }

  async function disconnectGoogle() {
    if (!window.confirm('Disconnect Google and remove locally stored OAuth tokens? Existing Google events and tasks will remain.')) return;
    setGoogleBusy(true);
    try {
      const response = await fetch('/api/google/status', { method: 'DELETE' });
      if (!response.ok) throw new Error('Google disconnect failed.');
      setGoogleAgenda(null);
      await loadGoogle(selectedDate);
      setSuccess('Google account disconnected.');
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google disconnect failed.');
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <Link href="/" className={styles.backLink}>← Operator</Link>
          <h1 className={styles.title}>Daily Command</h1>
        </div>
        <div className={styles.topActions}>
          <span className={styles.clock}>
            {now ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '--:--:-- --'}
          </span>
          <Link href="/gym" className={styles.dashboardLink}>Gym</Link>
        </div>
      </header>

      <main className={styles.content}>
        <section className={`${styles.commandStrip} ${focusTask ? MODE_CLASS[focusTask.personalityId] : ''}`}>
          <div className={`${styles.commandCell} ${styles.commandCellPrimary}`}>
            <span className={styles.eyebrow}>{activeTask ? 'Mode required now' : 'Next mode'}</span>
            <div className={styles.modeName}>{focusMode?.shortName ?? 'Unscheduled'}</div>
          </div>
          <div className={styles.commandCell}>
            <span className={styles.eyebrow}>{activeTask ? 'Current task' : 'Next task'}</span>
            <div className={styles.commandTask}>
              {focusTask ? `${formatTime12(focusTask.startTime)} — ${focusTask.title}` : 'No planned task for this date.'}
            </div>
            {focusTask?.details && <p className={styles.commandText}>{focusTask.details}</p>}
          </div>
          <div className={styles.commandCell}>
            <span className={styles.eyebrow}>Identity instruction</span>
            <div className={styles.commandText}>
              {focusMode?.identityStatement ?? 'Choose deliberately how you want to use this time.'}
            </div>
          </div>
        </section>

        <div className={styles.toolbar}>
          <div className={styles.dateNav}>
            <button className={styles.button} disabled={!selectedDate} onClick={() => setSelectedDate(addDays(selectedDate, -1))}>←</button>
            <div className={styles.dateTitle}>{selectedDate ? prettyDate(selectedDate) : 'Loading date...'}</div>
            <button className={styles.button} disabled={!selectedDate} onClick={() => setSelectedDate(addDays(selectedDate, 1))}>→</button>
          </div>
          <button className={styles.buttonQuiet} onClick={() => setSelectedDate(localDateKey())}>Today</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.workspace}>
          <div className={styles.column}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Timed agenda</h2>
              {loading ? (
                <div className={styles.empty}>Loading schedule...</div>
              ) : tasks.length === 0 ? (
                <div className={styles.empty}>No tasks saved for this date. Define the day using the task form.</div>
              ) : (
                <div className={styles.agenda}>
                  {tasks.map((task) => {
                    const mode = personalityMap[task.personalityId];
                    const current = !!now && isTaskActive(task, now) && selectedDate === localDateKey();
                    return (
                      <article
                        key={task.id}
                        className={`${styles.task} ${MODE_CLASS[task.personalityId]} ${current ? styles.taskCurrent : ''} ${task.status !== 'planned' ? styles.taskFinished : ''}`}
                      >
                        <div className={styles.taskTime}>
                          {formatTime12(task.startTime)}
                          {task.endTime && <span className={styles.taskEnd}>to {formatTime12(task.endTime)}</span>}
                        </div>
                        <div className={styles.taskMain}>
                          <h3 className={styles.taskTitle}>{task.title}</h3>
                          {task.details && <p className={styles.taskDetails}>{task.details}</p>}
                          <div className={styles.taskMeta}>
                            <span className={styles.badge}>{mode?.shortName ?? task.personalityId}</span>
                            <span className={styles.priorityBadge} data-priority={task.priority}>P{task.priority}</span>
                            <span className={styles.statusBadge} data-status={task.status}>{task.status}</span>
                            <span className={styles.muted}>{task.reminderMinutes}m reminder · {task.reminderChannel.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <div className={styles.taskActions}>
                          <label className={styles.taskModeControl}>
                            <span>Change mode</span>
                            <select
                              aria-label={`Change mode for ${task.title}`}
                              value={task.personalityId}
                              disabled={updatingTaskId === task.id}
                              onChange={(event) => updateTaskMode(task, event.target.value as PersonalityId)}
                            >
                              {personalities.map((personality) => (
                                <option key={personality.id} value={personality.id}>{personality.shortName}</option>
                              ))}
                            </select>
                          </label>
                          <div className={styles.taskStateActions}>
                            {task.status !== 'completed' && (
                              <button className={styles.statusButton} onClick={() => updateStatus(task, 'completed')}>Done</button>
                            )}
                            {task.status !== 'skipped' && (
                              <button className={styles.statusButton} onClick={() => updateStatus(task, 'skipped')}>Skip</button>
                            )}
                            {task.status !== 'planned' && (
                              <button className={styles.statusButton} onClick={() => updateStatus(task, 'planned')}>Reset</button>
                            )}
                            <button className={styles.buttonDanger} onClick={() => removeTask(task)}>Delete</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>The three operating modes</h2>
              <div className={styles.modeGrid}>
                {personalities.map((mode) => (
                  <div key={mode.id} className={`${styles.modeCard} ${MODE_CLASS[mode.id]}`}>
                    <div className={styles.modeHeading}>{mode.shortName}</div>
                    <div className={styles.modePurpose}>{mode.purpose}</div>
                    <div className={styles.modeRule}>{mode.behaviorRules[0]}</div>
                  </div>
                ))}
              </div>
            </section>

            {googleStatus?.connected && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Google agenda</h2>
                  <span className={styles.connectionBadge}>Live</span>
                </div>
                {!googleAgenda ? (
                  <div className={styles.empty}>Loading Google Calendar and Tasks...</div>
                ) : (
                  <div className={styles.googleAgendaGrid}>
                    <div>
                      <div className={styles.googleSectionTitle}>Calendar</div>
                      {googleAgenda.events.length === 0 ? (
                        <div className={styles.googleEmpty}>No Google Calendar events for this date.</div>
                      ) : googleAgenda.events.map((event) => (
                        <a key={event.id} className={styles.googleAgendaItem} href={event.htmlLink ?? '#'} target="_blank" rel="noreferrer">
                          <span className={styles.googleItemTime}>{formatGoogleDateTime(event.start)}</span>
                          <span>
                            <strong>{event.title}</strong>
                            <small>{event.fromVira ? 'Synced from VIRA' : 'Google Calendar'}</small>
                          </span>
                        </a>
                      ))}
                    </div>
                    <div>
                      <div className={styles.googleSectionTitle}>Google Tasks</div>
                      {googleAgenda.tasks.length === 0 ? (
                        <div className={styles.googleEmpty}>No due or undated Google Tasks.</div>
                      ) : googleAgenda.tasks.map((task) => (
                        <a key={task.id} className={`${styles.googleAgendaItem} ${task.status === 'completed' ? styles.googleItemComplete : ''}`} href={task.webViewLink ?? '#'} target="_blank" rel="noreferrer">
                          <span className={styles.googleTaskMark}>{task.status === 'completed' ? '✓' : '○'}</span>
                          <span>
                            <strong>{task.title}</strong>
                            <small>{task.fromVira ? 'Synced from VIRA' : 'Google Tasks'}</small>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className={styles.column}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Add timed task</h2>
              <form onSubmit={createTask}>
                <div className={styles.formGrid}>
                  <label className={styles.fieldWide}>
                    <span className={styles.label}>Task</span>
                    <input className={styles.input} value={form.title} maxLength={140} required onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Define a concrete outcome" />
                  </label>
                  <label className={`${styles.fieldWide} ${styles.descriptionField}`}>
                    <span className={styles.labelRow}>
                      <span className={styles.label}>Task description / definition of done</span>
                      <span className={styles.characterCount}>{form.details.length}/2000</span>
                    </span>
                    <textarea
                      className={styles.textarea}
                      value={form.details}
                      maxLength={2000}
                      rows={6}
                      onChange={(event) => setForm({ ...form, details: event.target.value })}
                      placeholder="Describe the result, steps, context, dependencies, and what finished looks like..."
                    />
                    <span className={styles.fieldHint}>Write enough detail that you can execute without deciding again later.</span>
                  </label>
                  <Time12Field label="Start" value={form.startTime} wide onChange={(startTime) => setForm({ ...form, startTime })} />
                  <Time12Field label="End" value={form.endTime} wide onChange={(endTime) => setForm({ ...form, endTime })} />
                  <label className={styles.fieldWide}>
                    <span className={styles.label}>Personality required</span>
                    <select className={styles.select} value={form.personalityId} onChange={(event) => setForm({ ...form, personalityId: event.target.value as PersonalityId })}>
                      {personalities.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Priority</span>
                    <select className={styles.select} value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) as 1 | 2 | 3 })}>
                      <option value={1}>P1 — Critical</option>
                      <option value={2}>P2 — Important</option>
                      <option value={3}>P3 — Optional</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Remind before</span>
                    <select className={styles.select} value={form.reminderMinutes} onChange={(event) => setForm({ ...form, reminderMinutes: Number(event.target.value) })}>
                      <option value={0}>At start</option>
                      <option value={5}>5 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                    </select>
                  </label>
                  <label className={styles.fieldWide}>
                    <span className={styles.label}>Reminder channel</span>
                    <select className={styles.select} value={form.reminderChannel} onChange={(event) => setForm({ ...form, reminderChannel: event.target.value as ReminderChannel })}>
                      <option value="both">Browser and email</option>
                      <option value="in_app">Browser only</option>
                      <option value="email">Email only</option>
                    </select>
                  </label>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.buttonPrimary} disabled={saving || !form.title.trim()}>{saving ? 'Saving...' : 'Save task'}</button>
                </div>
              </form>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Reminder system</h2>
              <p className={styles.settingsHint}>Your address and schedule stay in the local database. Connected Gmail is used first, with Resend as fallback.</p>
              <div className={styles.settingRow}>
                <input className={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              </div>
              <div className={styles.checkInCard}>
                <label className={styles.toggleRow}>
                  <span>
                    <strong>Two-hour focus email</strong>
                    <small>Interrupt drift and reconnect you to the work.</small>
                  </span>
                  <input type="checkbox" checked={checkInEnabled} onChange={(event) => setCheckInEnabled(event.target.checked)} />
                </label>
                <div className={styles.checkInSchedule}>
                  <Time12Field label="First email" value={checkInStartTime} onChange={setCheckInStartTime} />
                  <Time12Field label="Last email" value={checkInEndTime} onChange={setCheckInEndTime} />
                </div>
                <div className={styles.checkInSummary}>
                  Every 2 hours · {formatTime12(checkInStartTime)} to {formatTime12(checkInEndTime)} · daily
                </div>
              </div>
              <div className={styles.checkRow}>
                <span>Timezone: {snapshot?.settings.timezone ?? 'Asia/Kolkata'}</span>
              </div>
              <div className={styles.formActions}>
                <button className={styles.buttonPrimary} disabled={saving || !email.trim()} onClick={saveSettings}>{saving ? 'Saving...' : 'Save email schedule'}</button>
                <button className={styles.button} onClick={enableBrowserReminders}>Enable browser reminders</button>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Google Command Center</h2>
                <span className={`${styles.connectionBadge} ${googleStatus?.connected ? '' : styles.connectionBadgeIdle}`}>
                  {googleStatus?.connected ? 'Connected' : googleStatus?.configured ? 'Ready' : 'Setup required'}
                </span>
              </div>
              {!googleStatus ? (
                <div className={styles.empty}>Checking Google connection...</div>
              ) : !googleStatus.configured ? (
                <div className={styles.googleSetup}>
                  <p>One Google Cloud OAuth client is required. VIRA requests only Calendar events, Google Tasks, Gmail send-only, and account identity.</p>
                  <ol>
                    <li>Enable Calendar API, Tasks API, and Gmail API.</li>
                    <li>Create a Web OAuth client and add this redirect URI:</li>
                  </ol>
                  <code>{googleStatus.redirectUri}</code>
                  <p>Add <strong>GOOGLE_CLIENT_ID</strong> and <strong>GOOGLE_CLIENT_SECRET</strong> to <strong>.env.local</strong>, then restart VIRA.</p>
                  <a className={styles.buttonLink} href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud setup →</a>
                </div>
              ) : !googleStatus.connected ? (
                <div className={styles.googleSetup}>
                  <p>Connect <strong>{googleStatus.expectedEmail}</strong>. VIRA will reject a different Google account.</p>
                  <ul>
                    <li>Create and update Calendar events.</li>
                    <li>Create and update tasks in “VIRA Daily Command”.</li>
                    <li>Send reminders from your Gmail account.</li>
                  </ul>
                  <a className={styles.buttonLinkPrimary} href="/api/google/connect">Connect Google account →</a>
                </div>
              ) : (
                <div className={styles.googleConnected}>
                  <div className={styles.googleIdentity}>
                    <span className={styles.googleMark}>G</span>
                    <span><strong>{googleStatus.email}</strong><small>OAuth tokens encrypted locally</small></span>
                  </div>
                  <label className={styles.integrationRow}>
                    <span><strong>Google Calendar</strong><small>Mirror timed VIRA tasks as events</small></span>
                    <input type="checkbox" disabled={googleBusy} checked={googleStatus.calendarSyncEnabled} onChange={(event) => updateGooglePreference('calendarSyncEnabled', event.target.checked)} />
                  </label>
                  <label className={styles.integrationRow}>
                    <span><strong>Google Tasks</strong><small>Mirror status and due dates</small></span>
                    <input type="checkbox" disabled={googleBusy} checked={googleStatus.tasksSyncEnabled} onChange={(event) => updateGooglePreference('tasksSyncEnabled', event.target.checked)} />
                  </label>
                  <label className={styles.integrationRow}>
                    <span><strong>Gmail reminders</strong><small>Send from your own account</small></span>
                    <input type="checkbox" disabled={googleBusy} checked={googleStatus.gmailSendEnabled} onChange={(event) => updateGooglePreference('gmailSendEnabled', event.target.checked)} />
                  </label>
                  <div className={styles.googleActions}>
                    <button className={styles.buttonPrimary} disabled={googleBusy} onClick={syncGoogleNow}>{googleBusy ? 'Syncing...' : 'Sync this day'}</button>
                    <button className={styles.buttonDanger} disabled={googleBusy} onClick={disconnectGoogle}>Disconnect</button>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
