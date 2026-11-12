'use client';

import { FormEvent, useState } from 'react';

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not sign in.');
      window.location.assign(nextPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      <label style={{ display: 'grid', gap: 7, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
        Owner Password
        <input
          autoFocus
          autoComplete="current-password"
          type="password"
          required
          placeholder="Enter access key..."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 15,
            padding: '11px 14px',
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--lime)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
        />
      </label>
      {error ? <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: 0, fontWeight: 500 }}>{error}</p> : null}
      <button
        disabled={busy}
        style={{
          background: 'var(--lime)',
          border: 0,
          borderRadius: 8,
          color: '#FFFFFF',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.04em',
          padding: '12px 16px',
          transition: 'all 0.15s ease',
        }}
      >
        {busy ? 'AUTHENTICATING…' : 'SIGN IN →'}
      </button>
    </form>
  );
}
