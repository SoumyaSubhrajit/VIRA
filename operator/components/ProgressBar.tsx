interface ProgressBarProps {
  label: string;
  value: number;   // current
  max: number;     // maximum
  unit?: string;
  color?: 'lime' | 'amber' | 'danger';
  showPercent?: boolean;
  className?: string;
}

export default function ProgressBar({
  label,
  value,
  max,
  unit,
  color = 'lime',
  showPercent = true,
  className = '',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const barColor = {
    lime:   '#059669',
    amber:  '#D97706',
    danger: '#DC2626',
  }[color];

  const fmt = (n: number) =>
    unit === '₹'
      ? `₹${n.toLocaleString('en-IN')}`
      : unit
      ? `${n.toLocaleString('en-IN')}${unit}`
      : n.toLocaleString('en-IN');

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
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
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(value)}</span> / {fmt(max)}
          {showPercent && (
            <span style={{ color: barColor, fontWeight: 700, marginLeft: '6px' }}>{pct}%</span>
          )}
        </span>
      </div>
      <div
        style={{
          height: '6px',
          background: '#E2E8F0',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: '999px',
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
    </div>
  );
}
