# HANDOFF: Operator Build Status

## Current State

**Build:** ✅ Clean (`npm run build` passes with 0 TypeScript errors)
**Dev server:** Running in background (task-269) — http://localhost:3000

### Routes
| Route | Type | Description |
|-------|------|-------------|
| `/` | Static | Main dashboard (Gym, Finance, Career, Guide panels) |
| `/gym` | Static shell + client | Dedicated gym page |
| `/api/gym` | Dynamic | Dashboard gym summary |
| `/api/gym/calendar` | Dynamic | GET: full 6-month calendar / PATCH: write-back to Excel |
| `/api/finance` | Dynamic | Finance data (mock until finance.xlsx added) |
| `/api/career` | Dynamic | Career data (mock until career.xlsx added) |
| `/api/guide` | Dynamic | GET: memory feed / POST: trigger Gemini observation |

### What's built and working
- Dashboard with all 4 panels (Gym, Finance mock, Career mock, Guide)
- Gym panel: shows today's workout, week completion, 7-day streak grid, "VIEW 6-MONTH CALENDAR →" link
- Gym panel error state: shows clear error message instead of infinite "Loading..."
- `/gym` page: stats bar, month tabs (auto-detected from Excel data), full calendar grid, slide-in day detail panel
- Day detail panel: exercises list, Complete/Missed/Clear toggle, notes textarea, Save to Excel with file-lock detection
- Excel write-back: `PATCH /api/gym/calendar` updates Completed + Notes columns in gym.xlsx directly
- File lock detection: if gym.xlsx is open in Excel, returns HTTP 423 with clear "Close Excel" message

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
- **No separate DB**: Excel IS the database for gym data. Only lib functions touch the file.
- **UUID**: Using `crypto.randomUUID()` (Node built-in, no extra deps).
- **Error state**: Added `gymError` state to DashboardShell; GymPanel shows a real error message + link to /gym.
- **Calendar PATCH returns 423** (HTTP Locked) when Excel file is open — frontend shows 🔒 message.

## Known Issues / Blockers
- If `gym.xlsx` is open in Excel when saving from the UI, save will return a 423 error. User must close Excel first. This is by design (we detect the `~$gym.xlsx` lock file).
- Finance and Career use mock data. Real Excel files need to be placed in `data/` and parsing logic added to `lib/financeData.ts` and `lib/careerData.ts`.

## Next Single Task
- Add `GEMINI_API_KEY` to `.env.local` to activate the AI Guide panel, then test the full flow end-to-end.

## Agent Footprint (2026-06-21)
- **What was done:** Addressed user query regarding the "top 10% industry standard" for setting up a new GitHub repository (specifically for the `VIRA` project).
- **How it was done:** Created a detailed artifact (`repo_setup_guide.md`) outlining the 5 critical phases of repository setup (Protection rules, Documentation/README, Dev Environment/Linting, CI/CD Pipelines, and finally App scaffolding).
- **Why it was done:** The user explicitly requested to learn the "smart work" that high-level professionals do immediately after creating a repo, before writing application code.
- **Smart Work / Value Add:** Explained the *mentality* (pipelines and linting force testable/clean code) rather than just giving a list of tools. Left this footprint so future agents understand the advisory context provided.
