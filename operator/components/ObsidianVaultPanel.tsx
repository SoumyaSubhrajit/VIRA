'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './ObsidianVaultPanel.module.css';

type Status = {
  configured: boolean;
  enabled: boolean;
  vaultPath: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export function ObsidianVaultPanel({ selectedDate }: { selectedDate: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [vaultPath, setVaultPath] = useState('D:\\Obsidian\\VIRA');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/obsidian/status', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Could not load Obsidian status.');
    setStatus(body as Status);
    if (body.vaultPath) setVaultPath(body.vaultPath);
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load Obsidian status.'));
  }, [load]);

  async function saveAndSync() {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch('/api/obsidian/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath, date: selectedDate }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Obsidian sync failed.');
      setFeedback(`Vault updated: ${body.tasksExported} tasks, ${body.dailyLogsExported} daily logs, ${body.financeMonthsExported} finance months.`);
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Obsidian sync failed.');
    } finally {
      setBusy(false);
    }
  }

  const openUri = useMemo(() => status?.configured ? `obsidian://open?path=${encodeURIComponent(status.vaultPath)}` : '', [status]);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Obsidian Local Vault</h2>
        <span className={`${styles.badge} ${status?.configured ? '' : styles.badgeIdle}`}>{status?.configured ? 'Operational' : 'Setup'}</span>
      </div>
      <p className={styles.copy}>Private local command center. VIRA writes structured pages; your notes outside managed blocks stay untouched.</p>
      <label className={styles.label}>
        Vault folder
        <input className={styles.input} value={vaultPath} onChange={(event) => setVaultPath(event.target.value)} spellCheck={false} />
      </label>
      <div className={styles.metricRow}>
        <span><strong>Source of truth</strong><br />VIRA SQLite</span>
        <span><strong>Last sync</strong><br />{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Not yet synced'}</span>
      </div>
      <div className={styles.actions}>
        <button className={styles.button} disabled={busy || !vaultPath.trim()} onClick={saveAndSync}>{busy ? 'Syncing…' : 'Save + sync now'}</button>
        {openUri && <a className={styles.link} href={openUri}>Open Obsidian</a>}
      </div>
      {feedback && <p className={styles.feedback}>{feedback}</p>}
      {(error || status?.lastError) && <p className={`${styles.feedback} ${styles.error}`}>{error || status?.lastError}</p>}
    </section>
  );
}
