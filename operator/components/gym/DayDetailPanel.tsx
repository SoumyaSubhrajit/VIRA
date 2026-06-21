'use client';
import { useState, useEffect } from 'react';
import type { GymDay, DayType } from '@/lib/types';

interface DayDetailPanelProps {
  day: GymDay | null;
  onClose: () => void;
  onSaved: (updated: GymDay) => void;
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error' | 'locked';

export default function DayDetailPanel({ day, onClose, onSaved }: DayDetailPanelProps) {
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  
  // New edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editedDayType, setEditedDayType] = useState<string>('');
  const [editedExercises, setEditedExercises] = useState<string>('');

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Reset state when selected day changes
  useEffect(() => {
    if (day) {
      setCompleted(day.completed);
      setNotes(day.notes ?? '');
      setEditedDayType(day.dayType);
      setEditedExercises(day.exercises.join('\n'));
      setIsEditing(false);
      setStatus('idle');
      setErrorMsg('');
    }
  }, [day?.date]);

  const handleSave = async () => {
    if (!day) return;
    setStatus('saving');
    setErrorMsg('');

    try {
      const payload: any = { date: day.date, completed, notes };
      
      // Only send if they changed
      if (editedDayType !== day.dayType) {
        payload.dayType = editedDayType;
      }
      if (editedExercises !== day.exercises.join('\n')) {
        payload.exercises = editedExercises;
      }

      const res = await fetch('/api/gym/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setStatus('success');
        
        // Parse exercises back for the UI
        const parsedExercises = editedExercises.split('\n').map(s => s.trim()).filter(Boolean);
        
        onSaved({ 
          ...day, 
          completed, 
          notes,
          dayType: editedDayType as DayType,
          exercises: parsedExercises
        });
        
        setTimeout(() => {
          setStatus('idle');
          onClose(); // Automatically close after success
        }, 1500);
      } else {
        const body = await res.json();
        if (res.status === 423) {
          setStatus('locked');
        } else {
          setStatus('error');
        }
        setErrorMsg(body.error ?? 'Save failed');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Is the dev server running?');
    }
  };

  const isVisible = !!day;

  const dayTypeColors: Record<string, string> = {
    Push: 'var(--lime)',
    Pull: 'var(--amber)',
    Legs: '#7ecfff',
    Rest: 'var(--text-dim)',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Slide-in panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '400px',
          maxWidth: '90vw',
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-default)',
          zIndex: 50,
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {day && (
          <>
            {/* Panel header */}
            <div
              style={{
                padding: '1.25rem',
                borderBottom: '1px solid var(--border-default)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginBottom: '4px',
                  }}
                >
                  {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isEditing ? (
                    <input
                      value={editedDayType}
                      onChange={(e) => setEditedDayType(e.target.value)}
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '20px',
                        fontWeight: 700,
                        letterSpacing: '2px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--border-default)',
                        padding: '4px 8px',
                        width: '150px',
                        textTransform: 'uppercase'
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '20px',
                        fontWeight: 700,
                        letterSpacing: '2px',
                        color: dayTypeColors[editedDayType] ?? 'var(--text-primary)',
                      }}
                    >
                      {editedDayType.toUpperCase()} DAY
                    </span>
                  )}
                </div>
                
                {day.muscleFocus && !isEditing && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginTop: '4px',
                    }}
                  >
                    {day.muscleFocus}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Exercises */}
              {(day.dayType !== 'Rest' || isEditing) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div className="label">Exercises</div>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isEditing ? 'var(--lime)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        textTransform: 'uppercase'
                      }}
                    >
                      {isEditing ? 'Done Editing' : 'Edit Workout'}
                    </button>
                  </div>
                  
                  {isEditing ? (
                    <textarea
                      value={editedExercises}
                      onChange={(e) => setEditedExercises(e.target.value)}
                      placeholder="List exercises here, one per line..."
                      rows={10}
                      style={{
                        width: '100%',
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--lime)',
                        borderRadius: '4px',
                        padding: '10px 12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        resize: 'vertical',
                        outline: 'none',
                        lineHeight: 1.6,
                      }}
                    />
                  ) : (
                    <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {editedExercises.split('\n').filter(Boolean).map((ex, i) => (
                        <li
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                            padding: '8px 10px',
                            background: 'var(--bg-inset)',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            lineHeight: 1.5,
                          }}
                        >
                          <span style={{ color: 'var(--lime)', minWidth: '18px', fontWeight: 600 }}>{i + 1}.</span>
                          <span>{ex.replace(/^\d+\.\s*/, '')}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {day.dayType === 'Rest' && !isEditing && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px', background: 'var(--bg-inset)', borderRadius: '4px' }}>
                  Rest day — Recovery, mobility, sleep, magnesium at night.
                </div>
              )}

              {/* Completion status */}
              <div>
                <div className="label" style={{ marginBottom: '10px' }}>Session Status</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setCompleted(true)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '4px',
                      border: `1px solid ${completed === true ? 'var(--lime)' : 'var(--border-default)'}`,
                      background: completed === true ? 'var(--lime-dim)' : 'var(--bg-inset)',
                      color: completed === true ? 'var(--lime)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '12px',
                      fontWeight: 600,
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    ✓ Complete
                  </button>
                  <button
                    onClick={() => setCompleted(false)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '4px',
                      border: `1px solid ${completed === false ? 'var(--danger)' : 'var(--border-default)'}`,
                      background: completed === false ? 'var(--danger-dim)' : 'var(--bg-inset)',
                      color: completed === false ? 'var(--danger)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '12px',
                      fontWeight: 600,
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    ✗ Missed
                  </button>
                  <button
                    onClick={() => setCompleted(null)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '4px',
                      border: `1px solid ${completed === null ? 'var(--amber)' : 'var(--border-default)'}`,
                      background: 'var(--bg-inset)',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '12px',
                      fontWeight: 600,
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    —
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="label" style={{ marginBottom: '10px' }}>Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add session notes, PRs, how it felt..."
                  rows={4}
                  style={{
                    width: '100%',
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.6,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--lime)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              {/* Status messages */}
              {status === 'success' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--lime)', padding: '8px 12px', background: 'var(--lime-dim)', borderRadius: '4px', border: '1px solid var(--lime)' }}>
                  ✓ Saved to Excel successfully
                </div>
              )}
              {(status === 'error' || status === 'locked') && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--danger)', padding: '8px 12px', background: 'var(--danger-dim)', borderRadius: '4px', border: '1px solid var(--danger)' }}>
                  {status === 'locked' ? '🔒 ' : '⚠ '}{errorMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-default)' }}>
              <button
                onClick={handleSave}
                disabled={status === 'saving'}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: status === 'saving' ? 'var(--bg-inset)' : 'var(--lime-dim)',
                  border: '1px solid var(--lime)',
                  borderRadius: '4px',
                  color: 'var(--lime)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  cursor: status === 'saving' ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  opacity: status === 'saving' ? 0.6 : 1,
                }}
              >
                {status === 'saving' ? 'SAVING...' : 'SAVE TO EXCEL'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
