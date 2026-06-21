# BUILD PROMPT — "OPERATOR" PERSONAL DASHBOARD APP
*(Paste this entire prompt into Gemini CLI to scaffold the project)*

---

## PROJECT OVERVIEW

Build a personal dashboard web application called **"Operator"**. It consumes three Excel files (Gym, Finance, Career) and displays them as live-updating dashboards. A fourth panel hosts an AI "Guide" (powered by the Gemini API) that monitors all three data sources, retains memory across sessions, and proactively surfaces observations — similar to how Alfred/Oracle advises Batman in Arkham Knight: calm, only speaks up when something matters, never noisy.

---

## TECH STACK

- **Framework**: Next.js (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Excel parsing**: `xlsx` (SheetJS) on the server side
- **AI**: Google Gemini API via `@google/generative-ai` SDK
- **Data persistence**: local JSON files for memory/state (no database needed for v1)
- **Charts**: `recharts`

---

## FOLDER STRUCTURE

```
operator/
├── data/
│   ├── gym.xlsx
│   ├── finance.xlsx
│   ├── career.xlsx
│   └── agent_memory.json
├── public/
│   └── icons/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Main dashboard (all 4 panels)
│   │   ├── globals.css
│   │   └── api/
│   │       ├── gym/route.ts          # Reads + returns gym.xlsx data
│   │       ├── finance/route.ts      # Reads + returns finance.xlsx data
│   │       ├── career/route.ts       # Reads + returns career.xlsx data
│   │       └── guide/route.ts        # Calls Gemini with combined data + memory
│   ├── components/
│   │   ├── DashboardShell.tsx        # Overall layout grid
│   │   ├── GymPanel.tsx
│   │   ├── FinancePanel.tsx
│   │   ├── CareerPanel.tsx
│   │   ├── GuidePanel.tsx            # AI observations feed
│   │   ├── StatCard.tsx
│   │   ├── ProgressBar.tsx
│   │   └── StreakGrid.tsx
│   ├── lib/
│   │   ├── excelReader.ts            # Generic Excel -> JSON parser
│   │   ├── geminiClient.ts           # Gemini API wrapper
│   │   ├── memoryStore.ts            # Read/write agent_memory.json
│   │   └── types.ts                  # Shared TypeScript types
│   └── styles/
│       └── tokens.css                # Design tokens (see UI/UX section)
├── .env.local                        # GEMINI_API_KEY=your_key_here
├── package.json
├── tsconfig.json
└── README.md
```

---

## UI/UX DESIGN SPEC

**Visual direction:** "Mission control" — calm, dark, operational. Not a generic SaaS dashboard. Think tactical ops display, not Notion.

**Design tokens:**
- Background: `#0B0D0A` (near-black, slight green undertone)
- Panel surface: `#14170F`
- Borders/dividers: `#2A2F1F`
- Primary signal color (progress/positive): `#9FBF3B` (lime-olive)
- Secondary accent (alerts/highlights): `#E8A33D` (amber)
- Danger/warning: `#C9573D`
- Text primary: `#E7E6DC`
- Text muted: `#8C9180`

**Typography:**
- Display/headers: `Rajdhani` (technical, condensed, weight 600-700)
- Body/data: `JetBrains Mono` (monospace — reinforces "readout" feel for all numbers, dates, stats)
- Letter-spacing on headers/labels: 1-3px, uppercase for section labels

**Layout:**
- 2x2 grid on desktop (Gym | Finance top row, Career | AI Guide bottom row), single column stacked on mobile
- Each panel: header with section label (small, amber, uppercase, with a small square bullet marker), key stat in large monospace numerals, supporting chart/list below
- AI Guide panel: feed-style list of timestamped observations, color-coded by severity (`info` = muted text, `warning` = amber border, `priority` = lime border + bold)
- Top bar: app name "OPERATOR", current date, and a global "last synced" timestamp

**Interaction:**
- Subtle fade-in on data load, no flashy animations
- Manual "Refresh" button that re-reads Excel files and triggers a new Guide observation
- Respect `prefers-reduced-motion`
- Fully responsive down to mobile width (375px)

**Accessibility:**
- Visible keyboard focus states (lime outline)
- Sufficient contrast ratios (text on dark backgrounds must pass WCAG AA)

---

## FEATURE SPEC PER PANEL

### Gym Panel
- Pulls from `gym.xlsx` ("6-Month Calendar" sheet)
- Shows: today's Day Type (Push/Pull/Legs/Rest), today's exercises, current week completion (X/6), 7-day streak grid

### Finance Panel
- Pulls from `finance.xlsx`
- Shows: monthly spend vs. target, category breakdown (simple bar chart via recharts), savings rate

### Career Panel
- Pulls from `career.xlsx`
- Shows: current phase/milestone, skills in progress, target role/income progress bar (current ₹30k/month → target ₹60L/year)

### AI Guide Panel
- On each "Refresh" or on a schedule, sends a compact JSON summary of all 3 panels' current state + the last 10 entries from `agent_memory.json` to Gemini
- System prompt instructs Gemini to: act as a calm, observant guide; only flag things that matter (missed patterns, risks, milestones); avoid commenting on every minor change; tag each response with severity (`info`/`warning`/`priority`)
- Appends new observations to `agent_memory.json` so future calls have continuity
- Displays the feed newest-first

---

## GEMINI INTEGRATION DETAILS

- Use `gemini-2.0-flash` (free tier, fast, sufficient for this use case)
- API key read from `.env.local` (`GEMINI_API_KEY`)
- `src/lib/geminiClient.ts` should export a single function `getGuideObservation(dataSummary, memoryHistory)` that:
  1. Builds a system prompt (include the persona/context from the user's "Personal Operating System" document — embed it directly in the prompt template)
  2. Sends `dataSummary` + `memoryHistory` as the user message
  3. Requests structured JSON output: `{ "severity": "info"|"warning"|"priority", "observation": string, "suggested_action": string }`
  4. Parses and returns the result, with error handling for malformed JSON

---

## AGENT HANDOFF PROTOCOL (multi-session continuity)

This build will likely span multiple agent sessions/context windows. To avoid re-reading the entire codebase each time, maintain a single file:

```
operator/HANDOFF.md
```

At the end of every work session (or whenever context is running low), the agent MUST update `HANDOFF.md` with:
- **Current state**: what's built and working right now (be specific — "Gym panel renders with mock data, API route returns 200")
- **What's NOT done yet**: remaining steps from the Build Order, in order
- **Key decisions made**: any deviations from this spec and why (e.g., "used recharts BarChart instead of LineChart for Finance — better fit for category breakdown")
- **Known issues / blockers**: anything broken or unresolved
- **Next single task**: the ONE next concrete task to pick up — not a list, just the immediate next thing

When a new agent session starts, the FIRST action must be: read `HANDOFF.md` (and only `HANDOFF.md` — not the full codebase) to know exactly where to resume. Only open specific source files when the next task requires touching them. This keeps each session's startup cost minimal regardless of codebase size.

---

## DEVELOPMENT THINKING PROTOCOL (apply to non-trivial decisions)

For any decision with multiple reasonable implementations (e.g., "how should the Guide panel poll for updates," "how to structure the memory file," "which chart type fits this data"), the agent should:

1. Briefly consider 2-3 different approaches before picking one
2. Pick the simplest one that meets the spec — not the most "impressive" one
3. Record the choice and the one-line reason in `HANDOFF.md` under "Key decisions made"
4. If a later session finds an earlier decision was wrong, it's allowed to revise it — but must note the change and why in `HANDOFF.md`

This mirrors how the app's own AI Guide should reason (multiple options → pick deliberately → stay open to revision based on new evidence), applied to the build process itself.

---

## SAAS-READINESS (design for it now, don't build it now)

V1 is single-user, file-based, and local. To make a future SaaS conversion straightforward without rewriting v1, follow these constraints now:

- **Abstract all data access** behind functions in `src/lib/` (e.g., `getGymData()`, `getFinanceData()`, `saveMemory()`) — never read files directly from components or API routes. This means swapping local files for a database later only requires changing `src/lib/`, not the UI.
- **No hardcoded single-user assumptions** in business logic — e.g., avoid global singletons for state; pass a `userId` parameter through data-layer functions even though v1 only ever uses one fixed value (`"default-user"`). This makes multi-tenancy additive later, not a rewrite.
- **Environment-driven config** — API keys, file paths, and limits all come from environment variables, never hardcoded, so different environments (local/dev/hosted) just need different `.env` files.
- **Keep the Gemini prompt templates in a separate, swappable module** (`src/lib/prompts/`) — if this becomes a product, different users may want different "Guide" personas; isolating prompts now makes that a config change later, not a code change.
- Do NOT build auth, billing, multi-tenancy, or database migrations in v1 — just don't paint yourself into a corner that makes adding them later painful. Note any place where a v1 shortcut would block future SaaS work directly in `HANDOFF.md` under "Known issues / blockers" so it's tracked.

---

## BUILD ORDER (do this step by step, don't skip)

1. Scaffold Next.js + TypeScript + Tailwind project with the folder structure above
2. Implement `excelReader.ts` and the 3 API routes, test with sample/empty Excel files
3. Build `DashboardShell.tsx` and the 3 data panels with mock data first — get the UI/UX right before wiring real data
4. Wire real Excel data into the 3 panels
5. Implement `geminiClient.ts` and `memoryStore.ts`
6. Build `GuidePanel.tsx` and wire it to the `/api/guide` route
7. Polish: loading states, empty states, responsive breakpoints, accessibility pass
8. Write a README with setup instructions (where to place Excel files, how to add the Gemini API key, how to run locally)

---

## NOTES

- Keep v1 simple and working end-to-end before adding extra features (notifications, email, multi-device sync — these are explicitly out of scope for v1)
- All Excel reading happens server-side (API routes) — never expose file system access to the client
- Do not hardcode the Gemini API key anywhere in source — `.env.local` only, and ensure it's in `.gitignore`
