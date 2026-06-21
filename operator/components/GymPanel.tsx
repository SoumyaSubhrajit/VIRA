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
      <div className="panel fade-in" style={{ minHeight: '260px' }}>
        <span className="label">Physical</span>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
          Loading gym data...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '260px' }}>
        <span className="label">Physical</span>
        <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.6 }}>
          <div style={{ marginBottom: '8px' }}>⚠ Could not load gym data</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{error}</div>
        </div>
        <Link
          href="/gym"
          style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--lime)', textDecoration: 'none', marginTop: 'auto' }}
        >
          OPEN GYM PAGE →
        </Link>
      </div>
    );
  }

  const { today, weekCompletion, weekTotal, currentStreak, last7Days } = data;
  const dayTypeColor: Record<string, string> = {
    Push: 'var(--lime)',
    Pull: 'var(--amber)',
    Legs: '#7ecfff',
    Rest: 'var(--text-dim)',
  };

  return (
    <div className="panel fade-in">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <span className="label">Physical</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {today && (
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: dayTypeColor[today.dayType] ?? 'var(--text-muted)',
                padding: '2px 8px',
                border: `1px solid ${dayTypeColor[today.dayType] ?? 'var(--border-default)'}`,
                borderRadius: '3px',
              }}
            >
              {today.dayType} Day
            </span>
          )}
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'flex', gap: '2rem' }}>
        <StatCard label="Week" value={`${weekCompletion}/${weekTotal}`} unit="sessions" accent="lime" />
        <StatCard label="Streak" value={currentStreak} unit="days" accent={currentStreak >= 3 ? 'lime' : 'muted'} />
      </div>

      <div className="divider" />

      {/* Today's exercises */}
      {today ? (
        <div>
          <span className="label" style={{ marginBottom: '8px', display: 'flex' }}>
            Today — {today.dayType === 'Rest' ? 'Recovery' : today.muscleFocus}
          </span>
          {today.dayType === 'Rest' ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
              Rest day. Mobility, sleep, magnesium.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: 0 }}>
              {today.exercises.map((ex, i) => (
                <li
                  key={i}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}
                >
                  <span style={{ color: 'var(--text-dim)', minWidth: '16px' }}>{i + 1}.</span>
                  <span>{ex.replace(/^\d+\.\s*/, '')}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>
          No training entry found for today.
        </p>
      )}

      <div className="divider" />

      {/* Streak grid */}
      <StreakGrid days={last7Days} />

      {/* Link to full gym page */}
      <Link
        href="/gym"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          textDecoration: 'none',
          marginTop: '4px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--lime)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        VIEW 6-MONTH CALENDAR →
      </Link>
    </div>
  );
}
