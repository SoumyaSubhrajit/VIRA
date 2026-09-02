# HANDOFF: Operator Build Status

## Current State

**Build:** ✅ Clean (`npm run build` passes with 0 TypeScript errors)
**Production server:** Verified at http://localhost:3100

### Routes
| Route | Type | Description |
|-------|------|-------------|
| `/` | Static | Main dashboard (Gym, Finance, Career, Guide panels) |
| `/gym` | Static shell + client | Dedicated gym page |
| `/scheduler` | Static shell + client | Daily Command scheduler and personality-aware agenda |
| `/api/gym` | Dynamic | Dashboard gym summary |
| `/api/gym/calendar` | Dynamic | GET: full 6-month calendar / PATCH: write-back to Excel |
| `/api/finance` | Dynamic | Finance data (mock until finance.xlsx added) |
| `/api/career` | Dynamic | Career data (mock until career.xlsx added) |
| `/api/guide` | Dynamic | GET: memory feed / POST: trigger Gemini observation |
| `/api/scheduler` | Dynamic | GET: one day's tasks, settings, and three personality modes |
| `/api/scheduler/tasks` | Dynamic | POST: create a timed task |
| `/api/scheduler/tasks/[id]` | Dynamic | PATCH/DELETE: update status/details or delete a task |
| `/api/scheduler/settings` | Dynamic | GET/PATCH: local reminder account and preferences |
| `/api/scheduler/dispatch` | Dynamic | POST: protected due-email reminder dispatch |
| `/api/scheduler/plan` | Dynamic | PATCH: lock/unlock one daily plan and arm hourly accountability |
| `/api/google/connect` | Dynamic | Starts Google OAuth with CSRF state cookie |
| `/api/google/callback` | Dynamic | Validates account, encrypts tokens, and creates VIRA task list |
| `/api/google/status` | Dynamic | GET/PATCH/DELETE Google connection and sync preferences |
| `/api/google/agenda` | Dynamic | Reads one day's Google Calendar events and Google Tasks |
| `/api/google/sync` | Dynamic | Mirrors one day's VIRA tasks into Google services |

### What's built and working
- Dashboard with all 4 panels (Gym, Finance mock, Career mock, Guide)
- Gym panel: shows today's workout, week completion, 7-day streak grid, "VIEW 6-MONTH CALENDAR →" link
- Gym panel error state: shows clear error message instead of infinite "Loading..."
- `/gym` page: stats bar, month tabs (auto-detected from Excel data), full calendar grid, slide-in day detail panel
- Day detail panel: exercises list, Complete/Missed/Clear toggle, notes textarea, Save to Excel with file-lock detection
- Excel write-back: `PATCH /api/gym/calendar` updates Completed + Notes columns in gym.xlsx directly
- File lock detection: if gym.xlsx is open in Excel, returns HTTP 423 with clear "Close Excel" message
- Daily Command: timed tasks are assigned to Home Self, Builder, or Free Self and sorted into a daily agenda
- Identity banner: shows the current or next task and the exact personality to embody
- Task state: complete, skip, reset, and delete controls persist immediately
- Reminders: browser notifications while the page is open and protected Resend email dispatch through `scheduler.js`
- Time entry/display: explicit 12-hour hour, minute, and AM/PM controls; normalized 24-hour values remain in SQLite
- Locked-plan check-ins: duplicate-safe hourly email, gated by a per-day plan lock, with configurable windows that can cross midnight
- Progress reporting: UI and email progress bars show completed/total objectives; hourly mail includes the entire timeline and stops after one final 100% report
- Overnight scheduling: tasks can start or finish on the next calendar day while remaining part of the original operational plan
- Email presentation: responsive dark mission-briefing layout with objective, timing, operating mode, priority, execution directive, progress, timeline, and field questions
- Google Command Center: one-place connection controls and combined Calendar/Tasks agenda
- Automatic Google mirroring: local create/status/update/delete operations propagate to Calendar and Google Tasks when connected
- Gmail delivery: connected Gmail send-only OAuth is preferred, with Resend retained as a fallback
- Scheduler storage: SQLite at `data/vira-scheduler.sqlite`, ignored by Git; reminder email is not committed

### Data files
- `data/gym.xlsx` — ✅ Real data (6-Month Calendar, Mon 15 Jun 2026 → ~Dec 2026)
- `data/finance.xlsx` — ❌ Not yet available (Finance panel uses mock data)
- `data/career.xlsx` — ❌ Not yet available (Career panel uses mock data)
- `data/agent_memory.json` — Created on first Guide call

## What's NOT done yet
- Wire real `finance.xlsx` parsing in `lib/financeData.ts`
- Wire real `career.xlsx` parsing in `lib/careerData.ts`
- Add `GEMINI_API_KEY` to `.env.local` to activate the Guide panel

## Key Decisions Made
- **Excel write-back**: Chose to write directly to gym.xlsx (single source of truth). Lock file (`~$gym.xlsx`) detected before any write.
- **Month tabs vs scroll**: Chose tabs — cleaner UX for a 7-month span.
- **Hybrid persistence**: Excel remains the gym source of truth; SQLite stores scheduler tasks/settings because timed records require transactional querying and reminder state.
- **UUID**: Using `crypto.randomUUID()` (Node built-in, no extra deps).
- **Error state**: Added `gymError` state to DashboardShell; GymPanel shows a real error message + link to /gym.
- **Calendar PATCH returns 423** (HTTP Locked) when Excel file is open — frontend shows 🔒 message.

## Known Issues / Blockers
- If `gym.xlsx` is open in Excel when saving from the UI, save will return a 423 error. User must close Excel first. This is by design (we detect the `~$gym.xlsx` lock file).
- Finance and Career use mock data. Real Excel files need to be placed in `data/` and parsing logic added to `lib/financeData.ts` and `lib/careerData.ts`.
- Browser reminders require the scheduler page to remain open. For always-on delivery, run `npm run scheduler` with `RESEND_API_KEY` and `SCHEDULER_SECRET`, or configure an external cron caller.
- Google OAuth is configured locally and the account connection is active; credentials and tokens remain in ignored local storage.

## Next Single Task
- Enter the real recurring daily schedule, then add recurrence rules so repeated tasks do not need to be created manually.

## Agent Footprint (2026-06-21)
- **What was done:** Addressed user query regarding the "top 10% industry standard" for setting up a new GitHub repository (specifically for the `VIRA` project).
- **How it was done:** Created a detailed artifact (`repo_setup_guide.md`) outlining the 5 critical phases of repository setup (Protection rules, Documentation/README, Dev Environment/Linting, CI/CD Pipelines, and finally App scaffolding).
- **Why it was done:** The user explicitly requested to learn the "smart work" that high-level professionals do immediately after creating a repo, before writing application code.
- **Smart Work / Value Add:** Explained the *mentality* (pipelines and linting force testable/clean code) rather than just giving a list of tools. Left this footprint so future agents understand the advisory context provided.
