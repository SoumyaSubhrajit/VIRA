import type { GymDay } from '@/lib/types';

interface StreakGridProps {
  days: GymDay[];
}

export default function StreakGrid({ days }: StreakGridProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: '8px',
          display: 'block',
        }}
      >
        7-Day Consistency
      </span>
      <div style={{ display: 'flex', gap: '8px' }}>
        {days.map((day) => {
          const isToday = day.date === today;
          const isRest = day.dayType === 'Rest';

          let bg = 'var(--bg-base)';
          let border = 'var(--border-default)';
          let textColor = 'var(--text-muted)';

          if (isRest) {
            bg = '#F1F5F9';
            border = '#E2E8F0';
            textColor = '#94A3B8';
          } else if (day.completed === true) {
            bg = '#ECFDF5';
            border = '#A7F3D0';
            textColor = '#059669';
          } else if (day.completed === false) {
            bg = '#FEF2F2';
            border = '#FECACA';
            textColor = '#DC2626';
          }

          if (isToday && day.completed === null) {
            border = '#F59E0B';
            textColor = '#D97706';
          }

          const typeInitial = isRest ? 'R' : day.dayType[0];

          return (
            <div
              key={day.date}
              title={`${day.date} — ${day.dayType}${day.completed !== null ? (day.completed ? ' ✓' : ' ✗') : ''}`}
              style={{
                flex: 1,
                aspectRatio: '1',
                borderRadius: '8px',
                background: bg,
                border: `1px solid ${border}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                position: 'relative',
                boxShadow: isToday ? '0 0 0 2px rgba(245, 158, 11, 0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {isToday && (
                <div
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: '#D97706',
                  }}
                  className="pulse-dot"
                />
              )}
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: textColor,
                  lineHeight: 1,
                }}
              >
                {typeInitial}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'var(--text-dim)',
                  lineHeight: 1,
                }}
              >
                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'narrow',
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
