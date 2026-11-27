'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { GymData, FinanceData, CareerData, MemoryEntry } from '@/lib/types';
import GymPanel from './GymPanel';
import FinancePanel from './FinancePanel';
import CareerPanel from './CareerPanel';
import GuidePanel from './GuidePanel';

export default function DashboardShell() {
  const [gym, setGym] = useState<GymData | null>(null);
  const [gymError, setGymError] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [career, setCareer] = useState<CareerData | null>(null);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [cmdText, setCmdText] = useState('');
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdResult, setCmdResult] = useState<string | null>(null);
  const [dueReminders, setDueReminders] = useState<Array<{ id: string; title: string; startTime: string }>>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');

  const fetchData = async () => {
    const [gRes, fRes, cRes, mRes] = await Promise.all([
      fetch('/api/gym').catch(() => null),
      fetch('/api/finance').catch(() => null),
      fetch('/api/career').catch(() => null),
      fetch('/api/guide').catch(() => null),
    ]);

    if (gRes?.ok) {
      setGym(await gRes.json());
      setGymError(null);
    } else {
      const detail = gRes ? await gRes.json().catch(() => ({})) : {};
      setGymError(detail?.detail ?? 'Failed to load gym data from Excel.');
    }

    if (fRes?.ok) setFinance(await fRes.json());
    if (cRes?.ok) setCareer(await cRes.json());
    if (mRes?.ok) setMemory(await mRes.json());

    setLastSynced(new Date());
  };

  useEffect(() => {
    fetchData().finally(() => setLoadingInitial(false));
  }, []);

  // Poll scheduler every 20s for due in-app & browser notifications
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    } else {
      setNotifPermission('unsupported');
    }

    const getDismissed = (): Set<string> => {
      try {
        return new Set(JSON.parse(window.localStorage.getItem('vira-dismissed-reminders') || '[]'));
      } catch {
        return new Set();
      }
    };

    const getNotified = (): Set<string> => {
      try {
        return new Set(JSON.parse(window.localStorage.getItem('vira-browser-notified') || '[]'));
      } catch {
        return new Set();
      }
    };

    const checkDue = async () => {
      try {
        const todayKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const res = await fetch(`/api/scheduler?date=${todayKey}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as {
          tasks?: Array<{
            id: string;
            title: string;
            startTime: string;
            scheduledAt: string;
            status: string;
            reminderMinutes: number;
          }>;
        };
        const now = Date.now();
        const dismissed = getDismissed();
        const notified = getNotified();
        const active = (json.tasks ?? []).filter((t) => {
          if (t.status !== 'planned' || dismissed.has(t.id) || t.id.startsWith('gym-os:')) return false;
          const sched = new Date(t.scheduledAt).getTime();
          const trigger = sched - (t.reminderMinutes ?? 0) * 60_000;
          return now >= trigger && now <= sched + 30 * 60_000;
        });

        setDueReminders(active.map((t) => ({ id: t.id, title: t.title, startTime: t.startTime })));

        if ('Notification' in window && Notification.permission === 'granted') {
          let changed = false;
          for (const t of active) {
            if (!notified.has(t.id)) {
              new Notification(`VIRA Reminder · ${t.startTime}`, { body: t.title });
              notified.add(t.id);
              changed = true;
            }
          }
          if (changed) {
            window.localStorage.setItem('vira-browser-notified', JSON.stringify([...notified].slice(-50)));
          }
        }
      } catch {
        // silent poll failure
      }
    };

    void checkDue();
    const timer = setInterval(() => void checkDue(), 20_000);
    return () => clearInterval(timer);
  }, []);

  const dismissReminder = (id: string) => {
    try {
      const prev = JSON.parse(window.localStorage.getItem('vira-dismissed-reminders') || '[]') as string[];
      window.localStorage.setItem('vira-dismissed-reminders', JSON.stringify([...new Set([...prev, id])].slice(-100)));
    } catch {
      // ignore
    }
    setDueReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const completeReminder = async (id: string) => {
    dismissReminder(id);
    await fetch(`/api/scheduler/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    }).catch(() => null);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchData();
      const guideRes = await fetch('/api/guide', { method: 'POST' });
      if (guideRes.ok) {
        const newEntry = await guideRes.json();
        setMemory((prev) => [newEntry, ...prev]);
        setLastSynced(new Date());
      }
    } catch (err) {
      console.error('Refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cmdText.trim();
    if (!trimmed || cmdBusy) return;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => setNotifPermission(perm)).catch(() => null);
    }
    setCmdBusy(true);
    setCmdResult(null);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });
      const json = await res.json();
      setCmdResult(json.message || json.error || 'Done');
      if (json.ok && json.action !== 'answer') {
        setCmdText('');
        await fetchData();
      }
    } catch {
      setCmdResult('Command failed. Try again.');
    } finally {
      setCmdBusy(false);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0.85rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          {/* Brand & Nav Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <Link
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '3px',
                  background: 'var(--lime)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '18px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--text-primary)',
                }}
              >
                OPERATOR
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-inset)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-default)',
                }}
              >
                VIRA
              </span>
            </Link>

            {/* Navigation links */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Link
                href="/"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-panel-hover)',
                  textDecoration: 'none',
                }}
              >
                Dashboard
              </Link>
              <Link
                href="/gym"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Gym OS
              </Link>
              <Link
                href="/scheduler"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Daily Command
              </Link>
              <Link
                href="/finance"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Finance
              </Link>
              <Link
                href="/career"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Career
              </Link>
              <Link
                href="/radar"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Tech Radar
              </Link>
            </nav>
          </div>

          {/* Right Status Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                background: '#FFFFFF',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{todayStr}</span>
              <span style={{ color: 'var(--border-default)' }}>|</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                {lastSynced ? `Synced ${lastSynced.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'Syncing...'}
              </span>
            </div>

            <button
              className="btn"
              onClick={handleRefresh}
              disabled={loadingInitial || refreshing}
              style={{ height: '34px', padding: '0 14px' }}
            >
              {refreshing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '2rem 1.5rem 3rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}
      >
        {/* Minimal One-Line AI Command Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <form
            onSubmit={handleCommand}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#FFFFFF',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              padding: '6px 8px 6px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <span style={{ color: 'var(--lime)', fontWeight: 700, fontSize: '13px' }}>✦</span>
            <input
              value={cmdText}
              onChange={(e) => setCmdText(e.target.value)}
              placeholder='Ask VIRA or run a command (e.g. "Remind me to pay WiFi bill tomorrow 10am", "Log weight 78.5kg", "How much did I spend on food?")'
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '13px',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              className="btn"
              disabled={cmdBusy || !cmdText.trim()}
              style={{ height: '30px', padding: '0 12px', fontSize: '12px' }}
            >
              {cmdBusy ? 'Running...' : 'Run'}
            </button>
          </form>
          {cmdResult && (
            <div style={{ fontSize: '12px', color: 'var(--lime)', fontWeight: 500, paddingLeft: '6px' }}>
              {cmdResult}
            </div>
          )}
          {notifPermission === 'default' && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '6px' }}>
              Want popup desktop notifications for reminders?{' '}
              <button
                type="button"
                onClick={() => Notification.requestPermission().then(setNotifPermission)}
                style={{ color: 'var(--lime)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Enable browser alerts
              </button>
            </div>
          )}
          {dueReminders.map((rem) => (
            <div
              key={rem.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                background: 'var(--amber-dim)',
                border: '1px solid var(--amber)',
                borderRadius: '10px',
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                🔔 Reminder ({rem.startTime}): {rem.title}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void completeReminder(rem.id)}
                  style={{ fontSize: '11px', padding: '4px 10px', background: 'var(--lime)', color: '#fff', borderColor: 'var(--lime)' }}
                >
                  Done
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => dismissReminder(rem.id)}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <GymPanel data={gym} loading={loadingInitial} error={gymError} />
            <CareerPanel data={career} loading={loadingInitial} onUpdate={setCareer} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <FinancePanel data={finance} loading={loadingInitial} onRefresh={fetchData} />
            <GuidePanel entries={memory} loading={refreshing} />
          </div>
        </div>
      </main>
    </div>
  );
}
