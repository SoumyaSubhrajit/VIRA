# Operator — Personal Mission Control

A personal tactical dashboard built with Next.js, Tailwind CSS, Recharts, and the Gemini API.
It reads local Excel files (`gym.xlsx`, `finance.xlsx`, `career.xlsx`) and displays them as live panels, monitored by an AI "Guide" that surfaces patterns and risks.

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
   Place your Excel files in the `data/` directory:
   - `data/gym.xlsx` (Requires a "6-Month Calendar" sheet)
   - `data/finance.xlsx` (Currently using mock data, wait for v2 spec to connect real file)
   - `data/career.xlsx` (Currently using mock data, wait for v2 spec to connect real file)

4. **Run the App:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

## Architecture Notes
- All Excel parsing happens server-side in API routes (`/api/gym`, etc.).
- The AI Guide uses `gemini-2.0-flash` to process a summary of all panels.
- Agent memory is persisted to `data/agent_memory.json`.
- The data layer (`src/lib/`) abstracts file access and accepts a `userId`, making the app structurally ready for multi-tenancy in the future.
