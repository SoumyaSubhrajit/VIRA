interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  accent?: 'lime' | 'amber' | 'danger' | 'muted';
  className?: string;
}

export default function StatCard({
  label,
  value,
  unit,
  accent = 'lime',
  className = '',
}: StatCardProps) {
  const accentColor = {
    lime:   'var(--lime)',
    amber:  'var(--amber)',
    danger: 'var(--danger)',
    muted:  'var(--text-primary)',
  }[accent];

  return (
    <div
      className={`flex flex-col gap-1 p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] ${className}`}
      style={{ transition: 'all 0.15s ease' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span
          className="big-number"
          style={{ color: accent === 'muted' ? 'var(--text-primary)' : accentColor }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-muted)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
