'use client';
import type { CareerData } from '@/lib/types';
import ProgressBar from './ProgressBar';

interface CareerPanelProps {
  data: CareerData | null;
  loading: boolean;
}

export default function CareerPanel({ data, loading }: CareerPanelProps) {
  if (loading || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '280px', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Loading career data...
        </div>
      </div>
    );
  }

  const monthlyTarget = Math.round(data.targetIncome / 12);
  const incomeProgress = Math.round((data.currentIncome / monthlyTarget) * 100);

  return (
    <div className="panel fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="label">Career & Execution</span>
        {data.isMock && <span className="mock-badge">mock data</span>}
      </div>

      {/* Phase + milestone */}
      <div
        style={{
          background: 'var(--bg-base)',
          borderRadius: '8px',
          padding: '12px 14px',
          border: '1px solid var(--border-default)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--amber)',
            marginBottom: '4px',
          }}
        >
          {data.currentPhase}
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
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
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ color: 'var(--lime)', fontWeight: 700 }}>▸</span>
        <span>
          Target Role:{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{data.targetRole}</strong>
        </span>
      </div>

      {/* Income progress */}
      <ProgressBar
        label="Monthly Income Milestone"
        value={data.currentIncome}
        max={monthlyTarget}
        unit="₹"
        color={incomeProgress >= 75 ? 'lime' : incomeProgress >= 40 ? 'amber' : 'danger'}
      />

      <div className="divider" />

      {/* Skills */}
      <div>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '10px',
            display: 'block',
          }}
        >
          Core Engineering Competencies
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
              showPercent={true}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
