'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { GymDay } from '@/lib/types';
import GymStatsBar from '@/components/gym/GymStatsBar';
import CalendarGrid from '@/components/gym/CalendarGrid';
import DayDetailPanel from '@/components/gym/DayDetailPanel';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function GymPage() {
  const [gymDays, setGymDays] = useState<GymDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<GymDay | null>(null);
  const [activeMonth, setActiveMonth] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    fetch('/api/gym/calendar')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: GymDay[]) => {
        setGymDays(data);
        // Default: open on current month
        const now = new Date();
        setActiveMonth({ year: now.getFullYear(), month: now.getMonth() });
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  // Derive available months from data
  const availableMonths = useMemo(() => {
    const seen = new Set<string>();
    const result: { year: number; month: number }[] = [];
    for (const d of gymDays) {
      const key = d.date.slice(0, 7); // "YYYY-MM"
      if (!seen.has(key)) {
        seen.add(key);
        const [y, m] = d.date.split('-').map(Number);
        result.push({ year: y, month: m - 1 });
      }
    }
    return result;
  }, [gymDays]);

  // When a day is saved, update it in local state
  const handleDaySaved = (updated: GymDay) => {
    setGymDays((prev) => prev.map((d) => (d.date === updated.date ? updated : d)));
    setSelectedDay(updated);
  };

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <header
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem' }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--lime)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            ← OPERATOR
          </Link>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '3px',
              color: 'var(--lime)',
              margin: 0,
            }}
          >
            PHYSICAL TRAINING
          </h1>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          {todayStr}
        </span>
      </header>

      {/* Content */}
      <div style={{ flex: 1, padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-dim)', padding: '2rem 0' }}>
            Loading training calendar...
          </div>
        )}

        {error && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--danger)', padding: '12px', background: 'var(--danger-dim)', borderRadius: '4px', border: '1px solid var(--danger)' }}>
            ⚠ {error}
          </div>
        )}

        {!loading && !error && gymDays.length > 0 && (
          <>
            {/* Stats bar */}
            <GymStatsBar days={gymDays} />

            {/* Month tabs */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                flexWrap: 'wrap',
                borderBottom: '1px solid var(--border-default)',
                paddingBottom: '0',
              }}
            >
              {availableMonths.map((m) => {
                const isActive = activeMonth?.year === m.year && activeMonth?.month === m.month;
                return (
                  <button
                    key={`${m.year}-${m.month}`}
                    onClick={() => setActiveMonth(m)}
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase',
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--lime)' : '2px solid transparent',
                      color: isActive ? 'var(--lime)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      marginBottom: '-1px',
                    }}
                  >
                    {MONTH_NAMES[m.month].slice(0, 3)} {m.year}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { color: 'var(--lime)', label: 'Completed' },
                { color: 'var(--danger)', label: 'Missed' },
                { color: 'var(--amber)', label: 'Today' },
                { color: 'rgba(232,163,61,0.4)', label: 'Past / Unlogged' },
                { color: 'var(--border-subtle)', label: 'Future' },
                { color: 'var(--text-dim)', label: 'Rest Day' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Calendar */}
            {activeMonth && (
              <div className="panel">
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: '2px',
                    color: 'var(--text-primary)',
                    marginBottom: '1rem',
                  }}
                >
                  {MONTH_NAMES[activeMonth.month].toUpperCase()} {activeMonth.year}
                </div>
                <CalendarGrid
                  month={activeMonth.month}
                  year={activeMonth.year}
                  gymDays={gymDays}
                  selectedDate={selectedDay?.date ?? null}
                  onDayClick={setSelectedDay}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Side panel */}
      <DayDetailPanel
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        onSaved={handleDaySaved}
      />
    </div>
  );
}
