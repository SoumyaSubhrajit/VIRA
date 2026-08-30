import type { PersonalityMode } from './types';

export const PERSONALITY_MODES: PersonalityMode[] = [
  {
    id: 'home',
    name: 'Personality 1 — Home Self',
    shortName: 'Home Self',
    purpose: 'Family, closest relationships, emotional presence, patience, and ordinary human warmth.',
    identityStatement:
      'Be present, patient, and emotionally available. Your closest people are relationships to protect, not tasks to optimize.',
    behaviorRules: [
      'Listen before solving.',
      'Speak gently and clearly.',
      'Protect time for Mummy, Didi, family, and close friends.',
      'Do not carry competitive work behavior into trusted relationships.',
    ],
    sortOrder: 1,
  },
  {
    id: 'builder',
    name: 'Personality 2 — Builder',
    shortName: 'Builder',
    purpose: 'Career, goals, execution, skill, ambition, competition, and measurable achievement.',
    identityStatement:
      'Enter execution mode. Protect the goal, remove excuses, compete intelligently, and finish the defined outcome.',
    behaviorRules: [
      'Be ruthless with avoidance, not with people.',
      'Choose measurable output over performative busyness.',
      'Protect deep-work time and finish the highest-leverage task first.',
      'Review failure without self-deception and adjust quickly.',
    ],
    sortOrder: 2,
  },
  {
    id: 'free',
    name: 'Personality 3 — Free Self',
    shortName: 'Free Self',
    purpose: 'Wellbeing, mental recovery, travel, intimacy, dance, freedom, creativity, riding, play, and experience.',
    identityStatement:
      'Protect vitality. Make room for recovery, freedom, intimacy, creativity, movement, and experiences that make life worth building.',
    behaviorRules: [
      'Recovery is part of performance, not a reward for collapse.',
      'Create without demanding immediate utility.',
      'Protect consent, health, and emotional safety in intimate life.',
      'Schedule real experiences instead of endlessly postponing them.',
    ],
    sortOrder: 3,
  },
];

export const PERSONALITY_BY_ID = Object.fromEntries(
  PERSONALITY_MODES.map((mode) => [mode.id, mode])
) as Record<PersonalityMode['id'], PersonalityMode>;
