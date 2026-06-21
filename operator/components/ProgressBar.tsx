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
  const pct = Math.min(100, Math.round((value / max) * 100));
  const barColor = {
    lime:   'var(--lime)',
    amber:  'var(--amber)',
    danger: 'var(--danger)',
  }[color];
  const bgColor = {
    lime:   'var(--lime-dim)',
    amber:  'var(--amber-dim)',
    danger: 'var(--danger-dim)',
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
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          {fmt(value)} / {fmt(max)}
          {showPercent && (
            <span style={{ color: barColor, marginLeft: '6px' }}>{pct}%</span>
          )}
        </span>
      </div>
      <div
        style={{
          height: '4px',
          background: 'var(--border-subtle)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: '2px',
            boxShadow: `0 0 6px ${bgColor}`,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}
