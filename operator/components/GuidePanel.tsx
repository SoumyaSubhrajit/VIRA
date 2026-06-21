'use client';
import type { MemoryEntry } from '@/lib/types';

interface GuidePanelProps {
  entries: MemoryEntry[];
  loading: boolean;
}

export default function GuidePanel({ entries, loading }: GuidePanelProps) {
  return (
    <div className="panel flex-1 fade-in" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span className="label">Guide / Observations</span>
        {loading && (
          <span style={{ fontSize: '11px', color: 'var(--amber)', fontFamily: 'var(--font-mono)' }} className="pulse-dot">
            ANALYZING...
          </span>
        )}
      </div>

      {entries.length === 0 && !loading ? (
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '13px', margin: 'auto' }}>
          No observations recorded yet.
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
          }}
        >
          {entries.map((entry) => {
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return (
              <div
                key={entry.id}
                className={`fade-in sev-${entry.severity}`}
                style={{
                  borderLeft: '2px solid',
                  padding: '10px 12px',
                  borderRadius: '0 4px 4px 0',
                  background: 'var(--bg-inset)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-dim)',
                    }}
                  >
                    [{dateStr} {timeStr}]
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color:
                        entry.severity === 'priority'
                          ? 'var(--lime)'
                          : entry.severity === 'warning'
                          ? 'var(--amber)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {entry.severity}
                  </span>
                </div>

                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: entry.severity === 'info' ? 'var(--text-muted)' : 'var(--text-primary)',
                    lineHeight: 1.5,
                  }}
                >
                  {entry.observation}
                </p>

                {entry.suggested_action && (
                  <div
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ color: 'var(--lime)', fontSize: '14px', lineHeight: 1 }}>↳</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
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
