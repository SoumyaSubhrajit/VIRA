'use client';
import type { GymDay } from '@/lib/types';

interface DayCellProps {
  day: number;
  gymDay: GymDay | null;
  isSelected: boolean;
  onClick: () => void;
}

export default function DayCell({ day, gymDay, isSelected, onClick }: DayCellProps) {
  const today = new Date().toISOString().split('T')[0];
  const isToday = gymDay?.date === today;
  const isPast = gymDay ? gymDay.date < today : false;
  const isRest = gymDay?.dayType === 'Rest';
  const isFuture = gymDay ? gymDay.date > today : true;

  const dayTypeInitial = gymDay?.dayType ? gymDay.dayType[0] : '';
  const dayTypeColors: Record<string, string> = {
    P: 'var(--lime)',
    L: '#7ecfff',
    R: 'var(--text-dim)',
  };
  const typeColor = dayTypeColors[dayTypeInitial] ?? 'var(--text-muted)';

  // Background / border logic
  let bg = 'var(--bg-inset)';
  let border = 'var(--border-subtle)';
  let textColor = 'var(--text-dim)';
  let glow = 'none';

  if (!gymDay) {
    // Day not in the training program
    bg = 'transparent';
    border = 'transparent';
    textColor = 'var(--text-dim)';
  } else if (isRest) {
    bg = 'var(--bg-inset)';
    border = 'var(--border-subtle)';
    textColor = 'var(--text-dim)';
  } else if (gymDay.completed === true) {
    bg = 'rgba(159,191,59,0.1)';
    border = 'var(--lime)';
    glow = '0 0 8px rgba(159,191,59,0.2)';
    textColor = 'var(--lime)';
  } else if (gymDay.completed === false) {
    bg = 'rgba(201,87,61,0.1)';
    border = 'var(--danger)';
    textColor = 'var(--danger)';
  } else if (isToday) {
    bg = 'rgba(232,163,61,0.08)';
    border = 'var(--amber)';
    textColor = 'var(--amber)';
  } else if (isPast) {
    // Past, no data logged — warn
    bg = 'rgba(232,163,61,0.05)';
    border = 'rgba(232,163,61,0.3)';
    textColor = 'var(--text-muted)';
  } else {
    // Future
    bg = 'var(--bg-inset)';
    border = 'var(--border-subtle)';
    textColor = 'var(--text-muted)';
  }

  if (isSelected) {
    border = 'var(--lime)';
    glow = '0 0 0 2px rgba(159,191,59,0.4)';
  }

  return (
    <button
      onClick={gymDay ? onClick : undefined}
      disabled={!gymDay}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '4px',
        boxShadow: glow,
        cursor: gymDay ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        padding: '2px',
        transition: 'all 0.15s ease',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (gymDay) (e.currentTarget as HTMLElement).style.borderColor = 'var(--lime)';
      }}
      onMouseLeave={(e) => {
        if (gymDay && !isSelected) (e.currentTarget as HTMLElement).style.borderColor = border;
      }}
      title={gymDay ? `${gymDay.date} — ${gymDay.dayType}${gymDay.muscleFocus ? ': ' + gymDay.muscleFocus : ''}` : ''}
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
      {/* Day number */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 600,
          color: textColor,
          lineHeight: 1,
        }}
      >
        {day}
      </span>
      {/* Day type initial */}
      {gymDay && !isRest && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '10px',
            fontWeight: 700,
            color: gymDay.completed === true ? 'var(--lime)' : gymDay.completed === false ? 'var(--danger)' : typeColor,
            lineHeight: 1,
          }}
        >
          {gymDay.dayType === 'Push' ? 'PSH' : gymDay.dayType === 'Pull' ? 'PLL' : 'LEG'}
        </span>
      )}
      {/* Completion icon */}
      {gymDay && !isRest && (
        <span style={{ fontSize: '8px', lineHeight: 1 }}>
          {gymDay.completed === true ? '✓' : gymDay.completed === false ? '✗' : '·'}
        </span>
      )}
      {gymDay && isRest && (
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--text-dim)' }}>REST</span>
      )}
    </button>
  );
}
