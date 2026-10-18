import blocksJson from './data/blocks.json';
import templatesJson from './data/templates.json';
import seasonsJson from './data/seasons.json';
import accessoriesJson from './data/accessories.json';
import type { Block, LiftKey, Season, SessionCode, Templates, Tone } from './types';

export * from './types';

export const BLOCKS = blocksJson as Block[];
export const TEMPLATES = templatesJson as Templates;
export const SEASONS = seasonsJson as Season[];
export const ACCESSORY_OPTIONS = accessoriesJson as Record<string, string[]>;

export const PLAN_START = BLOCKS[0].start;
export const PLAN_END = BLOCKS[BLOCKS.length - 1].end;
export const ROAD_WEEKS = 208;

export const WEEKDAY_SESSIONS: (SessionCode | null)[] = ['BLADES', 'LEVIATHAN', 'GUARDIAN', 'SPARTAN', 'DRAUPNIR', 'VALHALLA', null];

export const SESSION_TONE: Record<SessionCode, Tone> = {
  BLADES: 'ember',
  LEVIATHAN: 'frost',
  GUARDIAN: 'gold',
  SPARTAN: 'moss',
  DRAUPNIR: 'ember',
  VALHALLA: 'frost',
};

/** Days with real leg work, for knee rules and load management. */
export const LOWER_BODY_SESSIONS: SessionCode[] = ['SPARTAN', 'VALHALLA'];
export const HEAVY_SESSIONS: SessionCode[] = ['BLADES', 'LEVIATHAN', 'SPARTAN'];

export const PHASE_LABEL: Record<Block['phase'], string> = {
  cut: 'Cut',
  hold: 'Hold',
  build: 'Build',
  mini: 'Mini-cut',
  review: 'Reassess',
  maint: 'Keep',
};
export const PHASE_TONE: Record<Block['phase'], Tone> = {
  cut: 'frost',
  hold: 'gold',
  build: 'moss',
  mini: 'frost',
  review: 'ash',
  maint: 'gold',
};
export const TPL_LABEL = { S: 'Strength', H: 'Volume' } as const;
export const TPL_TONE: Record<'S' | 'H', Tone> = { S: 'ember', H: 'frost' };

// ---------------------------------------------------------------- lifts (5.4, 6.5)

export type Slot = 'press' | 'bench' | 'pull' | 'squat';

export interface LiftDef {
  name: string;
  short: string;
  slot?: Slot;
  /** e1RM is of bodyweight plus added load. */
  bodyweight?: boolean;
}

export const LIFTS: Record<LiftKey, LiftDef> = {
  ohp: { name: 'Barbell Overhead Press', short: 'OHP', slot: 'press' },
  seated_press: { name: 'Seated Barbell Press', short: 'Seated press', slot: 'press' },
  bench: { name: 'Barbell Bench Press', short: 'Bench', slot: 'bench' },
  incline_bench: { name: 'Incline Bench Press 30°', short: 'Incline bench', slot: 'bench' },
  close_grip_bench: { name: 'Close-grip Bench Press', short: 'Close-grip bench', slot: 'bench' },
  pullup: { name: 'Weighted Pull-up', short: 'Pull-up', slot: 'pull', bodyweight: true },
  chinup: { name: 'Weighted Chin-up', short: 'Chin-up', slot: 'pull', bodyweight: true },
  neutral_pullup: { name: 'Weighted Neutral Pull-up', short: 'Neutral pull-up', slot: 'pull', bodyweight: true },
  squat: { name: 'Barbell Back Squat', short: 'Squat', slot: 'squat' },
  ssb_squat: { name: 'Safety-bar Squat', short: 'SSB squat', slot: 'squat' },
  belt_squat: { name: 'Belt Squat', short: 'Belt squat', slot: 'squat' },
  hipthrust: { name: 'Barbell Hip Thrust', short: 'Hip thrust' },
  shrug: { name: 'Barbell Shrug', short: 'Shrug' },
};

/** Yearly main-lift rotation (6.5). Index = year - 1. */
export const ROTATION: Record<Slot, { template: string; years: LiftKey[] }> = {
  press: { template: 'Barbell Overhead Press', years: ['ohp', 'seated_press', 'ohp', 'seated_press'] },
  bench: { template: 'Barbell Bench Press', years: ['bench', 'incline_bench', 'bench', 'close_grip_bench'] },
  pull: { template: 'Weighted Pull-up', years: ['pullup', 'chinup', 'pullup', 'neutral_pullup'] },
  squat: { template: 'Barbell Back Squat', years: ['squat', 'ssb_squat', 'squat', 'belt_squat'] },
};

/** Lifts shown on the Stats e1RM chart (3.5). */
export const STAT_LIFTS: LiftKey[] = ['ohp', 'bench', 'squat', 'pullup', 'hipthrust', 'shrug'];

/** Strength template percentages of e1RM by week, W1 to W5 (5.4). W6 reload uses W1. */
export interface PctRow {
  sets: number;
  reps: number;
  pct: number[];
  cap?: number;
}
export const PCT_TABLE = {
  press: { sets: 5, reps: 4, pct: [78, 80, 82, 84, 86] },
  bench: { sets: 5, reps: 3, pct: [81, 83, 85, 87, 89] },
  squat: { sets: 4, reps: 4, pct: [76, 78, 80, 82, 84], cap: 85 },
  shrug: { sets: 4, reps: 10, pct: [72, 74, 75, 77, 79] },
  hipthrustThu: { sets: 4, reps: 10, pct: [72, 74, 75, 77, 79] },
  hipthrustSat: { sets: 3, reps: 15, pct: [55, 55, 57, 57, 60] },
  pull: { sets: 4, reps: 5, pct: [78, 80, 82, 84, 86] },
} satisfies Record<string, PctRow>;

// ---------------------------------------------------------------- habits (6.4)

export type HabitSchedule = 'daily' | 'sunday' | 'first' | 'friday' | 'weekly' | 'lastSunday';

export interface HabitDef {
  schedule: HabitSchedule;
  task: string;
}

/** Keyed by season number. The Pause and Stillness are the breathing and meditation tasks. */
export const HABITS: Record<number, HabitDef> = {
  1: { schedule: 'daily', task: 'Breathe 5 min' },
  2: { schedule: 'daily', task: 'Same wake time, 7.5 h in bed' },
  3: { schedule: 'daily', task: 'Voice drill 5 min' },
  4: { schedule: 'daily', task: 'Meditate' },
  5: { schedule: 'sunday', task: 'Say one true thing out loud' },
  6: { schedule: 'first', task: 'Book your Mimir session' },
  7: { schedule: 'daily', task: 'A question before advice' },
  8: { schedule: 'daily', task: 'Their view before yours' },
  9: { schedule: 'friday', task: 'Teach one thing' },
  10: { schedule: 'weekly', task: 'One act of service' },
  11: { schedule: 'first', task: 'Pick and take one small step' },
  12: { schedule: 'first', task: 'Ship one free session or resource' },
  13: { schedule: 'lastSunday', task: 'Call the person you mentor' },
  14: { schedule: 'sunday', task: 'Work on your one-page code' },
  15: { schedule: 'daily', task: 'Rebuild your weakest habit' },
  16: { schedule: 'sunday', task: 'Weekly review, whatever happened' },
};

export const DAILY_CODE = [
  'Paused before I reacted',
  'Trained with restraint',
  'Said one true thing',
  'Served someone',
  'Chose from hope, not fear',
];

/** Meditation minutes by year once Stillness has started (5.6). */
export const MEDITATION_DOSE: Record<number, string> = { 1: '10', 2: '20', 3: '30', 4: '30-45' };
/** Wednesday zone 2 minutes by year (5.6). */
export const ZONE2_MIN: Record<number, number> = { 1: 30, 2: 35, 3: 40, 4: 45 };

export const STEPS_GOAL = 10000;
export const SLEEP_TARGET_H = 7.5;
