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
    muted:  'var(--text-muted)',
  }[accent];

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="label">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="big-number" style={{ color: accentColor }}>
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
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
