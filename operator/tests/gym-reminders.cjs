// Isolated database and mocked delivery; this never reads real gym data or sends real email.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
process.env.SCHEDULER_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vira-gym-reminder-test-')), 'test.sqlite');
process.env.GYM_EXCEL_PATH = path.join(os.tmpdir(), 'vira-no-legacy-workbook.xlsx');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

let sends = 0;
const gmailPath = require.resolve('../lib/google/gmail.ts');
require.cache[gmailPath] = { id: gmailPath, filename: gmailPath, loaded: true, exports: {
  sendWithConnectedGmail: async () => { sends += 1; return { sent: true, attempted: true }; },
} };
const googleDbPath = require.resolve('../lib/google/db.ts');
require.cache[googleDbPath] = { id: googleDbPath, filename: googleDbPath, loaded: true, exports: { getGoogleTaskLink: () => null } };
const googleSyncPath = require.resolve('../lib/google/sync.ts');
require.cache[googleSyncPath] = { id: googleSyncPath, filename: googleSyncPath, loaded: true, exports: { syncTaskToGoogle: async () => ({ calendar: 'disabled', tasks: 'disabled' }) } };

const gymDb = require('../lib/gym/db.ts');
const store = require('../lib/gym/reminderStore.ts');
const reminders = require('../lib/gym/reminders.ts');
const schedulerDb = require('../lib/scheduler/db.ts');

async function main() {
  const date = '2026-09-18';
  let snapshot = await gymDb.getGymOsSnapshot(date);
  assert.deepEqual(snapshot.reminders.schedule.map((item) => item.time), ['20:30', '20:55', '21:15', '21:45', '22:15', '22:30']);
  assert.equal(snapshot.todayTemplate.name, 'Chest B');
  assert.equal(snapshot.week[1].template.name, 'Chest A');
  assert.equal(snapshot.week[2].template.name, 'Back Width');
  const task = await schedulerDb.getTask(`gym-os:${date}`);
  assert.equal(task.title, 'Gym — Chest B');
  assert.equal(task.startTime, '21:00');
  assert.equal(task.endTime, '22:30');
  assert.equal(task.reminderChannel, 'in_app');

  await gymDb.applyGymAction({ action: 'swap_schedule', date, firstDate: snapshot.week[0].date, secondDate: snapshot.week[1].date, firstTemplateId: snapshot.week[0].template.id, secondTemplateId: snapshot.week[1].template.id });
  snapshot = await gymDb.getGymOsSnapshot(date);
  assert.equal(snapshot.week[0].template.name, 'Chest A');
  assert.equal(snapshot.week[1].template.name, 'Legs');

  const first = await reminders.dispatchGymReminders(new Date('2026-09-18T15:00:00.000Z'));
  const duplicate = await reminders.dispatchGymReminders(new Date('2026-09-18T15:01:00.000Z'));
  assert.equal(first.status, 'sent');
  assert.equal(first.slot, 'briefing');
  assert.equal(duplicate.status, 'already-attempted');
  assert.equal(sends, 1);

  const exercise = snapshot.todayTemplate.exercises[0];
  await gymDb.applyGymAction({ action: 'start_session', date, templateId: snapshot.todayTemplate.id, prePain: 2 });
  await gymDb.applyGymAction({ action: 'log_set', date, exerciseId: exercise.id, weightKg: 50, reps: 8, rir: 2, pain: 1, warmup: false });
  const checkpoint = await reminders.dispatchGymReminders(new Date('2026-09-18T15:45:00.000Z'));
  assert.equal(checkpoint.status, 'sent');
  assert.equal(checkpoint.slot, 'checkpoint-1');
  assert.equal(sends, 2);

  snapshot = await gymDb.getGymOsSnapshot(date);
  assert.equal(snapshot.reminders.deliveries.length, 2);
  assert(snapshot.reminders.deliveries.every((delivery) => delivery.status === 'sent'));
  const activity = snapshot.activity.find((day) => day.date === date);
  assert.equal(activity.workingSets, 1);
  assert.equal(activity.totalReps, 8);
  assert(activity.level > 0);

  const oneDayDate = '2026-09-19';
  await gymDb.applyGymAction({
    action: 'save_one_day_plan', date: oneDayDate, name: 'Back Width — One Day',
    focus: 'Lat width, rear delts, biceps, forearms and abs', trainingStartTime: '17:45', sessionMinutes: 90,
    exercises: [
      { name: 'Wide Grip Lat Pulldown', muscleGroup: 'Lats', targetSets: 4, minReps: 8, maxReps: 10 },
      { name: 'Dead Hang', muscleGroup: 'Forearms and grip', targetSets: 2, minReps: 30, maxReps: 30 },
    ],
  });
  const oneDay = await gymDb.getGymOsSnapshot(oneDayDate);
  assert.equal(oneDay.todayTemplate.name, 'Back Width — One Day');
  assert.equal(oneDay.profile.trainingStartTime, '17:45');
  assert.deepEqual(oneDay.reminders.schedule.map((item) => item.time), ['17:15', '17:40', '18:00', '18:30', '19:00', '19:15']);
  assert.equal((await gymDb.getGymOsSnapshot('2026-09-20')).profile.trainingStartTime, '21:00');

  await store.saveGymReminderSettings({ enabled: false, recipientEmail: 'soumyasubhrajit@gmail.com' });
  assert.equal((await reminders.dispatchGymReminders(new Date('2026-09-18T15:25:00.000Z'))).status, 'disabled');
  console.log('PASS: six-stage IST schedule, Timed Agenda task, live-set checkpoint, delivery deduplication, and pause control.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
