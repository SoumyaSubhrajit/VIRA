'use client';
import type { MemoryEntry } from '@/lib/types';

interface GuidePanelProps {
  entries: MemoryEntry[];
  loading: boolean;
}

export default function GuidePanel({ entries, loading }: GuidePanelProps) {
  return (
    <div className="panel flex-1 fade-in" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span className="label">AI Guide & Insights</span>
        {loading && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)' }} />
            Analyzing telemetry...
          </span>
        )}
      </div>

      {entries.length === 0 && !loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 'auto', textAlign: 'center', padding: '2rem 1rem' }}>
          No observations recorded yet. Click <strong>Sync Now</strong> to request an AI audit.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
            flex: 1,
            paddingRight: '4px',
            maxHeight: '440px',
          }}
        >
          {entries.map((entry) => {
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const severityStyles = {
              priority: {
                border: '1px solid #A7F3D0',
                borderLeft: '4px solid #059669',
                bg: '#ECFDF5',
                badgeBg: '#D1FAE5',
                badgeColor: '#059669',
              },
              warning: {
                border: '1px solid #FDE68A',
                borderLeft: '4px solid #D97706',
                bg: '#FFFBEB',
                badgeBg: '#FEF3C7',
                badgeColor: '#B45309',
              },
              info: {
                border: '1px solid #BFDBFE',
                borderLeft: '4px solid #2563EB',
                bg: '#EFF6FF',
                badgeBg: '#DBEAFE',
                badgeColor: '#1D4ED8',
              },
            }[entry.severity] ?? {
              border: '1px solid var(--border-default)',
              borderLeft: '4px solid var(--text-muted)',
              bg: 'var(--bg-base)',
              badgeBg: 'var(--bg-inset)',
              badgeColor: 'var(--text-muted)',
            };

            return (
              <div
                key={entry.id}
                className="fade-in"
                style={{
                  border: severityStyles.border,
                  borderLeft: severityStyles.borderLeft,
                  background: severityStyles.bg,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {dateStr} · {timeStr}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: severityStyles.badgeBg,
                      color: severityStyles.badgeColor,
                    }}
                  >
                    {entry.severity}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {entry.observation}
                </p>

                {entry.suggested_action && (
                  <div
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'baseline',
                      background: 'rgba(255, 255, 255, 0.7)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ color: severityStyles.badgeColor, fontWeight: 700, fontSize: '13px' }}>↳</span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {entry.suggested_action}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
