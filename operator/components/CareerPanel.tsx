'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CareerData, Skill } from '@/lib/types';
import ProgressBar from './ProgressBar';

interface CareerPanelProps {
  data: CareerData | null;
  loading: boolean;
  onUpdate?: (next: CareerData) => void;
}

export default function CareerPanel({ data, loading, onUpdate }: CareerPanelProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [phase, setPhase] = useState('');
  const [milestone, setMilestone] = useState('');
  const [income, setIncome] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);

  if (loading || !data) {
    return (
      <div className="panel fade-in" style={{ minHeight: '280px', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Loading career data...
        </div>
      </div>
    );
  }

  function startEdit() {
    if (!data) return;
    setPhase(data.currentPhase);
    setMilestone(data.currentMilestone);
    setIncome(String(data.currentIncome));
    setSkills(data.skills.map((s) => ({ ...s })));
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch('/api/career', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPhase: phase,
          currentMilestone: milestone,
          currentIncome: Number(income) || 0,
          skills,
        }),
      });
      if (res.ok) {
        const next = (await res.json()) as CareerData;
        onUpdate?.(next);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function requestAiFocus() {
    setAiBusy(true);
    try {
      const res = await fetch('/api/career', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_focus' }),
      });
      if (res.ok) {
        const next = (await res.json()) as CareerData;
        onUpdate?.(next);
      }
    } finally {
      setAiBusy(false);
    }
  }

  const monthlyTarget = Math.max(1, Math.round(data.targetIncome / 12));
  const incomeProgress = Math.round((data.currentIncome / monthlyTarget) * 100);

  return (
    <div className="panel fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span className="label">Career & Execution</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={aiBusy}
            onClick={requestAiFocus}
            style={{ fontSize: '11px', padding: '0.25rem 0.65rem' }}
          >
            {aiBusy ? 'Thinking...' : '✦ Weekly Focus'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={editing ? () => setEditing(false) : startEdit}
            style={{ fontSize: '11px', padding: '0.25rem 0.65rem' }}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <Link
            href="/career"
            style={{
              color: 'var(--lime)',
              textDecoration: 'none',
              fontFamily: 'var(--font-display)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginLeft: '4px',
            }}
          >
            Roadmap →
          </Link>
        </div>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Current Phase
            <input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                fontSize: '12px',
              }}
            />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Current Milestone
            <input
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                fontSize: '12px',
              }}
            />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Current Monthly Income (₹)
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                fontSize: '12px',
              }}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Skills (%)</span>
            {skills.map((skill, idx) => (
              <div key={skill.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', flex: 1 }}>{skill.name}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={skill.progress}
                  onChange={(e) => {
                    const next = [...skills];
                    next[idx] = { ...skill, progress: Number(e.target.value) || 0 };
                    setSkills(next);
                  }}
                  style={{
                    width: '68px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    fontSize: '12px',
                  }}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn"
            disabled={saving}
            onClick={saveEdit}
            style={{
              background: 'var(--lime)',
              color: '#FFFFFF',
              borderColor: 'var(--lime)',
              marginTop: '6px',
            }}
          >
            {saving ? 'Saving...' : 'Save Career Progress'}
          </button>
        </div>
      ) : (
        <>
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
            {data.weeklyFocus && (
              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px dashed var(--border-default)',
                  fontSize: '12px',
                  color: 'var(--lime)',
                  fontWeight: 500,
                }}
              >
                ✦ This week: {data.weeklyFocus}
              </div>
            )}
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
        </>
      )}
    </div>
  );
}
