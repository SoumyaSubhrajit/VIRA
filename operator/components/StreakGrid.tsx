import type { GymDay } from '@/lib/types';

interface StreakGridProps {
  days: GymDay[];
}

export default function StreakGrid({ days }: StreakGridProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <span className="label" style={{ marginBottom: '8px', display: 'flex' }}>
        7-Day Streak
      </span>
      <div style={{ display: 'flex', gap: '6px' }}>
        {days.map((day) => {
          const isToday = day.date === today;
          const isRest = day.dayType === 'Rest';

          let bg = 'var(--bg-inset)';
          let border = 'var(--border-subtle)';
          let glow = 'none';

          if (isRest) {
            bg = 'var(--border-subtle)';
            border = 'var(--border-subtle)';
          } else if (day.completed === true) {
            bg = 'var(--lime-dim)';
            border = 'var(--lime)';
            glow = '0 0 8px var(--lime-glow)';
          } else if (day.completed === false) {
            bg = 'var(--danger-dim)';
            border = 'var(--danger)';
          }

          if (isToday) {
            border = 'var(--amber)';
          }

          const typeInitial = isRest ? 'R' : day.dayType[0];
          const textColor =
            day.completed === true
              ? 'var(--lime)'
              : day.completed === false
              ? 'var(--danger)'
              : isRest
              ? 'var(--text-dim)'
              : isToday
              ? 'var(--amber)'
              : 'var(--text-muted)';

          return (
            <div
              key={day.date}
              title={`${day.date} — ${day.dayType}${day.completed !== null ? (day.completed ? ' ✓' : ' ✗') : ''}`}
              style={{
                flex: 1,
                aspectRatio: '1',
                borderRadius: '4px',
                background: bg,
                border: `1px solid ${border}`,
                boxShadow: glow,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                position: 'relative',
              }}
            >
              {isToday && (
                <div
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--amber)',
                  }}
                  className="pulse-dot"
                />
              )}
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: textColor,
                  lineHeight: 1,
                }}
              >
                {typeInitial}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
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
