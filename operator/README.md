# Operator — Personal Mission Control

A personal tactical dashboard built with Next.js, Tailwind CSS, Recharts, SQLite/Turso, and the Gemini API. Local development uses SQLite; production uses Turso, private Vercel Blob storage, and an owner login.

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure API Key:**
   Open `.env.local` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Data Files:**
   - Local Gym data lives in `data/vira-scheduler.sqlite`. When `TURSO_DATABASE_URL` is set, all application data uses the remote Turso database instead.
   - Progress photos use private Vercel Blob storage in production and `data/gym-photos/` during local development.
   - Finance and career retain their existing data integrations.

4. **Run the App:**
   ```bash
   npm run dev
   ```
Open [http://localhost:3100](http://localhost:3100)

## Gym OS

Open [http://localhost:3100/gym](http://localhost:3100/gym). The Gym OS provides:

- A Monday-to-Saturday Legs / Chest / Back / Shoulders / Chest / Back plan with Sunday recovery.
- A draggable weekly command rail: drag any workout day onto another to swap their assignments; swaps persist by date and can be changed again later.
- Working-set logging for load, reps, RIR, pain, warm-ups, notes, session duration, and post-workout fatigue.
- Daily weight and recovery check-ins, weekly body measurements, private progress-photo references, volume, streaks, completion, and estimated one-rep-max records.
- Editable workout templates and body-composition, nutrition, water, step, and session-time targets.
- A six-stage Gmail sequence derived from the configured training time: workout briefing 30 minutes before, launch command 5 minutes before, three checkpoints across the session, and a closing VIRA debrief at the scheduled finish.
- Automatic creation of the workout as a Builder task in Daily Command, with Google Calendar and Google Tasks synchronization when the account is connected.

SQLite/Turso is the source of truth after the one-time workbook migration. Future Gym OS changes do not modify the Excel file.

For the current 9:00–10:30 PM training window, emails run at 8:30 PM, 8:55 PM, 9:15 PM, 9:45 PM, 10:15 PM, and 10:30 PM in Asia/Kolkata. Each email includes muscle focus, the complete exercise prescription, previous or current working sets, live completion progress, and the next action. In production, an external cron service calls `/api/cron/tick` every minute; no permanently running Node process is required.

## Daily Command scheduler

Open [http://localhost:3100/scheduler](http://localhost:3100/scheduler) to create timed tasks and choose the identity to use for each one:

- **Home Self** — warmth and presence for family and close relationships.
- **Builder** — focused execution for career, goals, and achievement.
- **Free Self** — recovery, creativity, freedom, and wellbeing.

Tasks, times, statuses, personality modes, and reminder settings are stored in SQLite locally and Turso in production. Local database files are ignored by Git.

Browser reminders require the scheduler page to stay open and the user to click **Enable browser reminders** once. For email reminders, set these values in `.env.local` and run the reminder worker beside the app:

```text
RESEND_API_KEY=your_resend_key
SCHEDULER_SECRET=a_long_random_secret
```

```bash
npm run scheduler
```

Task times use explicit 12-hour hour/minute/AM-PM controls while the database stores normalized timestamps. A task can start or end on the next calendar day, so one operational plan can run past midnight.

Finish entering a day's tasks, then select **Lock plan + hourly emails**. While that day is locked, VIRA sends a duplicate-safe email every hour inside the configured window. The window may cross midnight (for example, 3:00 AM through 2:00 AM the following day). Every email includes a completion percentage, visual progress bar, complete task timeline, remaining work, current/next objective, operating mode, and review questions. Once every task is complete, one final 100% email is sent and further hourly messages stop.

The reminder email address and focus window are configured from the scheduler page. In production, call `POST /api/cron/tick` once per minute with `Authorization: Bearer <SCHEDULER_SECRET>`. Call `POST /api/finance/import` once daily with the same header.

## Google Calendar, Tasks, and Gmail

VIRA supports one secure Google OAuth connection for `soumyasubhrajit@gmail.com`:

- Timed VIRA tasks are created and updated in the primary Google Calendar.
- Tasks are mirrored into a dedicated **VIRA Daily Command** Google Tasks list.
- Calendar events and Google Tasks appear inside the Daily Command page.
- Reminder emails use Gmail send-only access first, with Resend as fallback.

One-time Google Cloud setup:

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Calendar API**, **Google Tasks API**, and **Gmail API**.
3. Configure the OAuth consent screen. While the app is in testing, add `soumyasubhrajit@gmail.com` as a test user.
4. Create an OAuth client with application type **Web application**.
5. Add this authorized redirect URI exactly: `http://localhost:3100/api/google/callback`.
6. Add the generated values to `.env.local`:

```text
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3100/api/google/callback
GOOGLE_ACCOUNT_EMAIL=soumyasubhrajit@gmail.com
```

Restart VIRA, open `/scheduler`, and select **Connect Google account** in Google Command Center. OAuth refresh tokens are AES-256-GCM encrypted before being stored in the ignored local SQLite database; the Google password is never handled or stored by VIRA.

## Architecture Notes
- Gym OS uses normalized SQLite-compatible tables accessed through `/api/gym/os`; Excel is read only for the one-time legacy migration.
- The AI Guide uses `gemini-2.0-flash` to process a summary of all panels.
- Agent memory and Daily Command data are persisted in the shared SQLite/Turso database.
- Google integration uses Google's Node.js OAuth client with the documented Calendar, Tasks, and Gmail REST endpoints, offline OAuth, encrypted refresh-token storage, state validation, and narrow Calendar-events, Tasks, Gmail-send, and identity scopes.
- The data layer (`src/lib/`) abstracts file access and accepts a `userId`, making the app structurally ready for multi-tenancy in the future.
