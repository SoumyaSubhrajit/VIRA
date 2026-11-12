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
            <CareerPanel data={career} loading={loadingInitial} />
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
