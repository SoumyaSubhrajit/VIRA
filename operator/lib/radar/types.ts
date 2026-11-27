export const RADAR_CATEGORIES = [
  'Dev Tools',
  'GitHub Repos',
  'AI & Agents',
  'Security',
  '.NET / Automation',
] as const;

export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

export interface TechRadarItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: RadarCategory;
  metric: string;
  tldr: string;
  howToUse: string;
  saved: boolean;
  fetchedDate: string;
}
