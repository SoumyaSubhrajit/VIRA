const cron = require('node-cron');

const baseUrl = process.env.VERA_BASE_URL || 'http://localhost:3100';

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

// Schedule tasks to be run on the server.
// '30 6 * * *' means exactly at 6:30 AM every day
cron.schedule('30 6 * * *', async () => {
  console.log('[Scheduler] Triggering Morning Gym Reminder at 6:30 AM...');
  try {
    const data = await callEndpoint('/api/cron/gym-reminder');
    console.log('[Scheduler] Gym email sent successfully:', data);
  } catch (err) {
    console.error('[Scheduler] Gym reminder failed. Is Next.js running?', err.message);
  }
});

console.log('VERA Scheduler running. Task and hourly locked-plan email checks run every minute; gym reminder runs at 6:30 AM.');
