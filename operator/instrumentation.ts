export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.VERCEL) return;

  const globalState = globalThis as typeof globalThis & { __viraReminderTicker?: boolean };
  if (globalState.__viraReminderTicker) return;
  globalState.__viraReminderTicker = true;

  const { dispatchDueReminders } = await import('@/lib/scheduler/reminders');
  const { dispatchGymReminders } = await import('@/lib/gym/reminders');

  const runTick = async () => {
    try {
      const [tasksRes, gymRes] = await Promise.allSettled([
        dispatchDueReminders(),
        dispatchGymReminders(),
      ]);
      if (tasksRes.status === 'fulfilled' && tasksRes.value.sent > 0) {
        console.log('[VIRA local ticker] Task reminders sent:', tasksRes.value.sent);
      }
      if (gymRes.status === 'fulfilled' && gymRes.value.sent > 0) {
        console.log('[VIRA local ticker] Gym reminder sent:', gymRes.value.slot);
      }
    } catch (err) {
      console.warn('[VIRA local ticker] Tick error:', err);
    }
  };

  setTimeout(() => void runTick(), 4000);
  setInterval(() => void runTick(), 30_000);
}
