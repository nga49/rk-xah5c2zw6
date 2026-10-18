import type { Equipment } from '../plan/exercises';

/* Weights are always stored in kilograms. The chosen unit only changes what is shown and typed,
   and the plate steps loads round to (5 lb on the bar in pounds, 2.5 kg in kilos). */

export type Unit = 'kg' | 'lb';
export const LB_PER_KG = 2.20462262;
const EPS = 1e-6;

export interface UnitPrefs {
  units?: Unit;
  dumbbellStep?: number;
  dumbbellStepLb?: number;
}

export interface Units {
  unit: Unit;
  label: string;
  /** kg to the display unit (unrounded). */
  toDisplay: (kg: number) => number;
  /** A typed value in the display unit to kg. */
  fromDisplay: (v: number) => number;
  /** kg to a tidy display number (0.1 lb, or up to 2 decimals in kg). */
  show: (kg: number) => number;
  /** Plate or stack step for this equipment, in the display unit. */
  step: (eq: Equipment) => number;
  roundDown: (kg: number, eq: Equipment) => number;
  /** Dumbbells to the nearest pair, everything else down. */
  roundFor: (kg: number, eq: Equipment) => number;
  nextUp: (kg: number, eq: Equipment) => number;
  /** 5% lighter, to the nearest available weight, and always at least one step down. */
  dropFive: (kg: number, eq: Equipment) => number;
  same: (a: number, b: number) => boolean;
  /** "137.5 kg" or "295 lb". kgDigits caps the decimals shown in kg. */
  w: (kg: number, kgDigits?: number) => string;
  /** Plan targets: whole pounds, exact kilos ("2 × 110 lb", "50 kg"). */
  around: (kg: number) => string;
  /** "+0.3 kg/week" style, sign included. */
  rate: (kgPerWeek: number) => string;
}

export function unitsOf(p?: UnitPrefs | null): Units {
  const unit: Unit = p?.units === 'lb' ? 'lb' : 'kg';
  const lb = unit === 'lb';
  const toDisplay = (kg: number) => (lb ? kg * LB_PER_KG : kg);
  const fromDisplay = (v: number) => (lb ? v / LB_PER_KG : v);
  const show = (kg: number) => (lb ? Math.round(toDisplay(kg) * 10) / 10 : Math.round(kg * 100) / 100);
  const step = (eq: Equipment): number => {
    if (lb) {
      if (eq === 'dumbbell') return p?.dumbbellStepLb ?? 5;
      if (eq === 'sled') return 10;
      if (eq === 'weighted') return 2.5;
      return 5;
    }
    if (eq === 'dumbbell') return p?.dumbbellStep ?? 2;
    if (eq === 'sled') return 5;
    return 2.5;
  };
  const down = (kg: number, s: number) => fromDisplay(Math.floor(toDisplay(kg) / s + EPS) * s);
  const nearest = (kg: number, s: number) => fromDisplay(Math.round(toDisplay(kg) / s) * s);
  const fmt = (n: number) => String(n);
  return {
    unit,
    label: unit,
    toDisplay,
    fromDisplay,
    show,
    step,
    roundDown: (kg, eq) => down(kg, step(eq)),
    roundFor: (kg, eq) => (eq === 'dumbbell' ? nearest(kg, step(eq)) : down(kg, step(eq))),
    nextUp: (kg, eq) => {
      const s = step(eq);
      return fromDisplay(Math.floor(toDisplay(kg) / s + EPS) * s + s);
    },
    dropFive: (kg, eq) => {
      const s = step(eq);
      const v = toDisplay(kg);
      let target = Math.round((v * 0.95) / s) * s;
      if (target >= v - EPS) target = Math.ceil(v / s - EPS) * s - s;
      return fromDisplay(Math.max(0, Math.round(target * 100) / 100));
    },
    same: (a, b) => Math.abs(a - b) < 0.01,
    w: (kg, kgDigits = 2) => `${fmt(lb ? show(kg) : Math.round(kg * 10 ** kgDigits) / 10 ** kgDigits)} ${unit}`,
    around: (kg) => `${fmt(lb ? Math.round(toDisplay(kg)) : show(kg))} ${unit}`,
    rate: (kgPerWeek) => {
      const v = Math.round(toDisplay(kgPerWeek) * 100) / 100;
      return `${v >= 0 ? '+' : ''}${v} ${unit}/week`;
    },
  };
}
