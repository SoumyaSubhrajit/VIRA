'use client';
import type { GymDay } from '@/lib/types';

interface GymStatBarProps {
  days: GymDay[];
}

export default function GymStatsBar({ days }: GymStatBarProps) {
  const today = new Date().toISOString().split('T')[0];
  const past = days.filter((d) => d.date <= today && d.dayType !== 'Rest');
  const completed = past.filter((d) => d.completed === true).length;
  const missed = past.filter((d) => d.completed === false).length;
  const rate = past.length > 0 ? Math.round((completed / past.length) * 100) : 0;

  // Streak
  let streak = 0;
  const sorted = [...past].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (const d of sorted) {
    if (d.completed === true) streak++;
    else break;
  }

  const totalScheduled = days.filter((d) => d.dayType !== 'Rest').length;

  const stats = [
    { label: 'Current Streak', value: streak, unit: 'days', color: streak >= 5 ? 'var(--lime)' : streak >= 2 ? 'var(--amber)' : 'var(--text-muted)' },
    { label: 'Completed', value: completed, unit: 'sessions', color: 'var(--lime)' },
    { label: 'Missed', value: missed, unit: 'sessions', color: missed > 0 ? 'var(--danger)' : 'var(--text-muted)' },
    { label: 'Completion Rate', value: `${rate}%`, unit: '', color: rate >= 80 ? 'var(--lime)' : rate >= 50 ? 'var(--amber)' : 'var(--danger)' },
    { label: 'Total Scheduled', value: totalScheduled, unit: 'sessions', color: 'var(--text-muted)' },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '1px',
        background: 'var(--border-default)',
        border: '1px solid var(--border-default)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: 'var(--bg-panel)',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {s.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.6rem',
                fontWeight: 600,
                color: s.color,
                lineHeight: 1,
              }}
            >
              {s.value}
            </span>
            {s.unit && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                {s.unit}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
