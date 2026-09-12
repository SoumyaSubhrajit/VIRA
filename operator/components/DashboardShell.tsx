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
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: '100vh' }}>

      {/* Top Bar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, letterSpacing: '4px', margin: 0, color: 'var(--lime)' }}>
            OPERATOR
          </h1>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)' }}>
            {todayStr}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link
            href="/scheduler"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'var(--lime)',
              textDecoration: 'none',
            }}
          >
            Daily Command →
          </Link>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
            LAST SYNC: {lastSynced ? lastSynced.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
          </span>
          <button
            className="btn"
            onClick={handleRefresh}
            disabled={loadingInitial || refreshing}
            style={{ width: '120px', justifyContent: 'center' }}
          >
            {refreshing ? 'SYNCING...' : 'REFRESH'}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gap: '1.5rem',
          flex: 1,
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
    </div>
  );
}
