// Generic, pain-guided rehab rows for the injured area in the Load and Build phases. A physio's
// prescription (Phase 7) replaces them for that area. HEURISTIC: common examples of isometric then light
// isotonic work, not a validated protocol and not tailored to a diagnosis. Never in Protect.
import type { Phase, Region } from './model';

export interface RehabItem {
  name: string;
  sets: number;
  reps: string;
  rest_s: number;
  perSide?: boolean;
  note?: string;
}

type Lib = { load: RehabItem[]; build: RehabItem[] };

const KNEE_FRONT: Lib = {
  load: [
    { name: 'Quad set, knee straight', sets: 3, reps: '10 × 5 s hold', rest_s: 30, perSide: true },
    { name: 'Isometric knee extension, seated', sets: 4, reps: '30 s hold, easy effort', rest_s: 60, perSide: true },
  ],
  build: [
    { name: 'Leg extension, light and slow', sets: 3, reps: '12', rest_s: 60, perSide: true },
    { name: 'Step-up, low box', sets: 3, reps: '10', rest_s: 60, perSide: true },
  ],
};

const LIB: Partial<Record<Region, Lib>> = {
  quad: KNEE_FRONT,
  knee: {
    load: [
      { name: 'Quad set, knee straight', sets: 3, reps: '10 × 5 s hold', rest_s: 30, perSide: true },
      { name: 'Straight leg raise', sets: 3, reps: '10', rest_s: 45, perSide: true },
    ],
    build: [
      { name: 'Terminal knee extension, band', sets: 3, reps: '15', rest_s: 45, perSide: true },
      { name: 'Box squat to a high box', sets: 3, reps: '10', rest_s: 60 },
    ],
  },
  hamstring: {
    load: [
      { name: 'Isometric bridge hold, heels on a bench', sets: 4, reps: '30 s hold', rest_s: 60 },
      { name: 'Isometric leg curl hold, light', sets: 3, reps: '30 s hold', rest_s: 60, perSide: true },
    ],
    build: [
      { name: 'Bridge walkout', sets: 3, reps: '6', rest_s: 60 },
      { name: 'Single-leg bridge', sets: 3, reps: '10', rest_s: 60, perSide: true },
    ],
  },
  calf: {
    load: [{ name: 'Isometric calf raise hold', sets: 4, reps: '30 s hold', rest_s: 60 }],
    build: [{ name: 'Calf raise, both legs, slow', sets: 3, reps: '15', rest_s: 60 }],
  },
  'ankle-foot': {
    load: [{ name: 'Ankle circles and alphabet, pain-free range', sets: 2, reps: '1 min', rest_s: 30, perSide: true }],
    build: [{ name: 'Calf raise, both legs, slow', sets: 3, reps: '15', rest_s: 60 }],
  },
  adductor: {
    load: [{ name: 'Isometric adductor squeeze, ball between the knees', sets: 4, reps: '30 s hold, easy effort', rest_s: 60 }],
    build: [{ name: 'Side-lying hip adduction', sets: 3, reps: '12', rest_s: 60, perSide: true }],
  },
  groin: {
    load: [{ name: 'Isometric adductor squeeze, ball between the knees', sets: 4, reps: '30 s hold, easy effort', rest_s: 60 }],
    build: [{ name: 'Side-lying hip adduction', sets: 3, reps: '12', rest_s: 60, perSide: true }],
  },
  glute: {
    load: [{ name: 'Glute bridge hold', sets: 4, reps: '30 s hold', rest_s: 60 }],
    build: [{ name: 'Glute bridge', sets: 3, reps: '12', rest_s: 60 }],
  },
  hip: {
    load: [{ name: 'Glute bridge hold', sets: 4, reps: '30 s hold', rest_s: 60 }],
    build: [{ name: 'Side-lying hip abduction', sets: 3, reps: '12', rest_s: 60, perSide: true }],
  },
  'lower-back': {
    load: [
      { name: 'Bird dog', sets: 3, reps: '6 × 5 s hold', rest_s: 45, perSide: true },
      { name: 'Curl-up', sets: 3, reps: '8', rest_s: 45 },
    ],
    build: [{ name: 'Side plank, knees down', sets: 3, reps: '20 s', rest_s: 45, perSide: true }],
  },
  shoulder: {
    load: [{ name: 'Isometric external rotation against a wall', sets: 4, reps: '30 s hold, easy effort', rest_s: 45, perSide: true }],
    build: [
      { name: 'Band external rotation', sets: 3, reps: '15', rest_s: 45, perSide: true },
      { name: 'Band pull-apart, light', sets: 3, reps: '15', rest_s: 45 },
    ],
  },
  neck: {
    load: [{ name: 'Isometric neck holds, 4 directions', sets: 2, reps: '10 s each way', rest_s: 30 }],
    build: [{ name: 'Chin tuck', sets: 3, reps: '10', rest_s: 30 }],
  },
  elbow: {
    load: [{ name: 'Isometric wrist extension hold', sets: 4, reps: '45 s hold, easy effort', rest_s: 60, perSide: true }],
    build: [{ name: 'Slow wrist extension, light dumbbell', sets: 3, reps: '15', rest_s: 60, perSide: true }],
  },
  forearm: {
    load: [{ name: 'Isometric wrist extension hold', sets: 4, reps: '45 s hold, easy effort', rest_s: 60, perSide: true }],
    build: [{ name: 'Slow wrist extension, light dumbbell', sets: 3, reps: '15', rest_s: 60, perSide: true }],
  },
  'wrist-hand': {
    load: [{ name: 'Wrist range of motion, pain-free', sets: 2, reps: '1 min', rest_s: 30, perSide: true }],
    build: [{ name: 'Slow wrist extension, light dumbbell', sets: 3, reps: '15', rest_s: 60, perSide: true }],
  },
};

const GENERIC: Lib = { load: [{ name: 'Gentle pain-free range of motion', sets: 2, reps: '1 min', rest_s: 30 }], build: [] };

/** Rehab rows for a region and phase. Protect and Return add none (Protect is gentle movement only). */
export function rehabFor(region: Region, phase: Phase | 'stop'): RehabItem[] {
  if (phase !== 'load' && phase !== 'build') return [];
  return (LIB[region] ?? GENERIC)[phase];
}

export const REHAB_CONDITION = 'Only if pain stays at 3/10 or less';
