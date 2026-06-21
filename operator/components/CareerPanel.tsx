'use client';
import type { CareerData } from '@/lib/types';
import StatCard from './StatCard';
import ProgressBar from './ProgressBar';

interface CareerPanelProps {
  data: CareerData | null;
  loading: boolean;
}

export default function CareerPanel({ data, loading }: CareerPanelProps) {
  if (loading || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '260px' }}>
        <span className="label">Career</span>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
          Loading career data...
        </div>
      </div>
    );
  }

  // Income: monthly current vs monthly target (target annual / 12)
  const monthlyTarget = Math.round(data.targetIncome / 12);
  const incomeProgress = Math.round((data.currentIncome / monthlyTarget) * 100);

  return (
    <div className="panel fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="label">Career</span>
        {data.isMock && <span className="mock-badge">mock data</span>}
      </div>

      {/* Phase + milestone */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--amber)',
            marginBottom: '4px',
          }}
        >
          {data.currentPhase}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          {data.currentMilestone}
        </div>
      </div>

      {/* Target role */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-inset)',
          borderRadius: '4px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ color: 'var(--lime)', fontSize: '10px' }}>▸</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          Target:{' '}
          <span style={{ color: 'var(--text-primary)' }}>{data.targetRole}</span>
        </span>
      </div>

      {/* Income progress */}
      <ProgressBar
        label="Income Target"
        value={data.currentIncome}
        max={monthlyTarget}
        unit="₹"
        color={incomeProgress >= 75 ? 'lime' : incomeProgress >= 40 ? 'amber' : 'danger'}
      />

      <div className="divider" />

      {/* Skills */}
      <div>
        <span className="label" style={{ marginBottom: '10px', display: 'flex' }}>
          Skills in Progress
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {data.skills.map((skill) => (
            <ProgressBar
              key={skill.name}
              label={skill.name}
              value={skill.progress}
              max={100}
              unit="%"
              color={skill.progress >= 70 ? 'lime' : skill.progress >= 40 ? 'amber' : 'danger'}
              showPercent={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
