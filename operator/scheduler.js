const cron = require('node-cron');

const baseUrl = process.env.VERA_BASE_URL || 'http://localhost:3100';

cron.schedule('* * * * *', async () => {
  try {
    const result = await callEndpoint('/api/finance/dispatch', {method:'POST',headers:{Authorization:`Bearer ${process.env.SCHEDULER_SECRET || ''}`}});
    if (result.status === 'sent' || result.status === 'failed') console.log('[Finance reminder]', result.status);
  } catch (error) { console.error('[Finance reminder]', error.message); }
}, {timezone:'Asia/Kolkata'});

async function callEndpoint(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

// Check the database every minute. The API prevents duplicate email reminders.
cron.schedule('* * * * *', async () => {
  try {
    const headers = process.env.SCHEDULER_SECRET
      ? { Authorization: `Bearer ${process.env.SCHEDULER_SECRET}` }
      : undefined;
    const result = await callEndpoint('/api/scheduler/dispatch', { method: 'POST', headers });
    if (result.sent || result.failed) {
      console.log('[Scheduler] Reminder dispatch:', result);
    }
  } catch (error) {
    console.error('[Scheduler] Reminder dispatch failed:', error.message);
  }
});

// Check the six-stage Gym OS sequence every minute. The API claims each slot
// in SQLite before sending, so restarts and overlapping ticks cannot duplicate it.
cron.schedule('* * * * *', async () => {
  try {
    const headers = process.env.SCHEDULER_SECRET
      ? { Authorization: `Bearer ${process.env.SCHEDULER_SECRET}` }
      : undefined;
    const result = await callEndpoint('/api/gym/dispatch', { method: 'POST', headers });
    if (result.status === 'sent' || result.status === 'failed') {
      console.log('[Gym sequence]', result);
    }
  } catch (error) {
    console.error('[Gym sequence] Dispatch failed:', error.message);
  }
}, { timezone: 'Asia/Kolkata' });

// Import bank/UPI transaction alert emails once daily. Override this cron
// expression with FINANCE_IMPORT_CRON in .env.local.
cron.schedule(process.env.FINANCE_IMPORT_CRON || '15 2 * * *', async () => {
  console.log('[Scheduler] Starting daily Gmail finance import...');
  try {
    const headers = process.env.SCHEDULER_SECRET
      ? { Authorization: `Bearer ${process.env.SCHEDULER_SECRET}` }
      : undefined;
    const result = await callEndpoint('/api/finance/import', { method: 'POST', headers });
    console.log('[Scheduler] Finance import completed:', result);
  } catch (error) {
    console.error('[Scheduler] Finance import failed:', error.message);
  }
}, { timezone: 'Asia/Kolkata' });

// Drain the durable Notion outbox every five minutes. New task writes also try
// immediately; this job recovers automatically after network/API outages.
cron.schedule('*/5 * * * *', async () => {
  try {
    const headers = process.env.SCHEDULER_SECRET
      ? { Authorization: `Bearer ${process.env.SCHEDULER_SECRET}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
    const result = await callEndpoint('/api/notion/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    if (result.processed || result.failed) console.log('[Notion sync]', result);
  } catch (error) {
    console.error('[Notion sync] Outbox drain failed:', error.message);
  }
}, { timezone: 'Asia/Kolkata' });

// Refresh the local Obsidian command center every five minutes. The sync is
// idempotent and preserves all writing outside VIRA-managed note blocks.
cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await callEndpoint('/api/obsidian/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (result.filesWritten) console.log('[Obsidian sync]', result);
  } catch (error) {
    console.error('[Obsidian sync] Vault refresh failed:', error.message);
  }
}, { timezone: 'Asia/Kolkata' });

console.log('VERA Scheduler running. Reminders check every minute; Obsidian and Notion sync every five minutes; finance import runs daily at 2:15 AM IST.');
