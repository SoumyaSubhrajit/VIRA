const cron = require('node-cron');

// Schedule tasks to be run on the server.
// '30 6 * * *' means exactly at 6:30 AM every day
cron.schedule('30 6 * * *', async () => {
  console.log('[Scheduler] Triggering Morning Gym Reminder at 6:30 AM...');
  try {
    const res = await fetch('http://localhost:3000/api/cron/gym-reminder');
    const data = await res.json();
    if (res.ok) {
      console.log('[Scheduler] Email sent successfully:', data);
    } else {
      console.error('[Scheduler] Failed to send email:', data);
    }
  } catch (err) {
    console.error('[Scheduler] Network error triggering API. Is Next.js running?', err.message);
  }
});

console.log('VERA Scheduler running. Gym reminder set for 6:30 AM daily.');
