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
      <label style={{ display: 'grid', gap: 7, color: '#aeb7a8', fontSize: 13 }}>
        Owner password
        <input
          autoFocus
          autoComplete="current-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{ background: '#0c100b', border: '1px solid #36402f', borderRadius: 8, color: '#f4f6ee', fontSize: 16, padding: '13px 14px' }}
        />
      </label>
      {error ? <p role="alert" style={{ color: '#ff9b84', fontSize: 13, margin: 0 }}>{error}</p> : null}
      <button disabled={busy} style={{ background: '#b5dc42', border: 0, borderRadius: 8, color: '#10140c', cursor: 'pointer', fontWeight: 900, letterSpacing: 1.5, padding: 14 }}>
        {busy ? 'SIGNING IN…' : 'ENTER VIRA'}
      </button>
    </form>
  );
}
