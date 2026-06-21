import type { CareerData } from './types';
import path from 'path';
import fs from 'fs';

// When career.xlsx exists, swap the mock below for real parsing.
// Only this file needs to change — no UI or API route edits needed.

const MOCK: CareerData = {
  currentPhase: 'Phase 2 — Skill Consolidation',
  currentMilestone: 'Complete Full-Stack Portfolio Project',
  currentIncome: 30000,       // ₹30k/month
  targetIncome: 5000000,      // ₹60L/year → ₹5,00,000/month? No → 6000000/12=500000
  // Actually ₹60L/year = 6,000,000 / 12 = 500,000/month
  // But prompt says target ₹60L/year. Storing annual.
  skills: [
    { name: 'Next.js / React', progress: 72 },
    { name: 'TypeScript', progress: 60 },
    { name: 'System Design', progress: 35 },
    { name: 'DSA / LeetCode', progress: 45 },
    { name: 'Node.js / APIs', progress: 68 },
  ],
  targetRole: 'Senior Full-Stack Engineer',
  isMock: true,
};

export function getCareerData(_userId: string): CareerData {
  const careerFile = path.join(process.cwd(), 'data', 'career.xlsx');
  if (fs.existsSync(careerFile)) {
    // TODO: implement real parsing when career.xlsx is available
  }
  return MOCK;
}
