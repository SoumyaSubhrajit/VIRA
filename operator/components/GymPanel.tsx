'use client';
import Link from 'next/link';
import type { GymData } from '@/lib/types';
import StatCard from './StatCard';
import StreakGrid from './StreakGrid';

interface GymPanelProps {
  data: GymData | null;
  loading: boolean;
  error: string | null;
}

export default function GymPanel({ data, loading, error }: GymPanelProps) {
  if (loading) {
    return (
      <div className="panel fade-in" style={{ minHeight: '280px', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Loading gym data...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '280px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="label">Physical</span>
          <span style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>Sync issue</span>
        </div>
        <div style={{ padding: '12px', background: 'var(--danger-dim)', borderRadius: '8px', border: '1px solid #FECACA' }}>
          <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>⚠ Could not load gym data</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{error}</div>
        </div>
        <Link
          href="/gym"
          className="btn"
          style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
        >
          Open Gym OS →
        </Link>
      </div>
    );
  }

  const { today, weekCompletion, weekTotal, currentStreak, last7Days } = data;

  return (
    <div className="panel fade-in">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <span className="label">Physical</span>
        {today && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: today.dayType === 'Rest' ? 'var(--text-muted)' : 'var(--lime)',
              background: today.dayType === 'Rest' ? 'var(--bg-inset)' : 'var(--lime-dim)',
              padding: '3px 10px',
              border: `1px solid ${today.dayType === 'Rest' ? 'var(--border-default)' : '#A7F3D0'}`,
              borderRadius: '999px',
            }}
          >
            {today.dayType} Day
          </span>
        )}
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <StatCard label="Week Sessions" value={`${weekCompletion}/${weekTotal}`} unit="completed" accent="lime" />
        <StatCard label="Current Streak" value={currentStreak} unit="days" accent={currentStreak >= 3 ? 'lime' : 'muted'} />
      </div>

      <div className="divider" />

      {/* Today's exercises */}
      {today ? (
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Today</span>
            <span style={{ color: 'var(--text-dim)' }}>—</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
              {today.dayType === 'Rest' ? 'Recovery & Mobility' : today.muscleFocus}
            </span>
          </div>

          {today.dayType === 'Rest' ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', margin: 0 }}>
              Rest day. Hydration, mobility, magnesium, and active recovery.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: 0 }}>
              {today.exercises.slice(0, 5).map((ex, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      minWidth: '18px',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{ex.replace(/^\d+\.\s*/, '')}</span>
                </li>
              ))}
              {today.exercises.length > 5 && (
                <li style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '26px' }}>
                  +{today.exercises.length - 5} more exercises in full routine
                </li>
              )}
            </ol>
          )}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          No workout scheduled for today.
        </p>
      )}

      <div className="divider" />

      {/* Streak grid */}
      <StreakGrid days={last7Days} />

      {/* Link to full gym page */}
      <Link
        href="/gym"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'var(--font-display)',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--lime)',
          textDecoration: 'none',
          marginTop: '0.25rem',
        }}
      >
        View Complete Gym OS →
      </Link>
    </div>
  );
}
