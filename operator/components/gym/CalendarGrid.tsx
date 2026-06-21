'use client';
import type { GymDay } from '@/lib/types';
import DayCell from './DayCell';

interface CalendarGridProps {
  month: number; // 0-indexed (0=Jan)
  year: number;
  gymDays: GymDay[];
  selectedDate: string | null;
  onDayClick: (day: GymDay) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarGrid({
  month,
  year,
  gymDays,
  selectedDate,
  onDayClick,
}: CalendarGridProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  // Convert to Monday-first (0=Mon, 6=Sun)
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  // Build a lookup map
  const gymMap: Record<string, GymDay> = {};
  for (const d of gymDays) {
    const [y, m] = d.date.split('-').map(Number);
    if (y === year && m - 1 === month) {
      gymMap[d.date] = d;
    }
  }

  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - offset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ day: null, dateStr: null });
    } else {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({ day: dayNum, dateStr });
    }
  }

  return (
    <div>
      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '4px 0',
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((cell, i) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={i} style={{ aspectRatio: '1' }} />;
          }
          const gymDay = gymMap[cell.dateStr] ?? null;
          return (
            <DayCell
              key={cell.dateStr}
              day={cell.day}
              gymDay={gymDay}
              isSelected={selectedDate === cell.dateStr}
              onClick={() => gymDay && onDayClick(gymDay)}
            />
          );
        })}
      </div>
    </div>
  );
}
