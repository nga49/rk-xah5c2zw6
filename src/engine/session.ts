import {
  ACCESSORY_OPTIONS,
  BLOCKS,
  LIFTS,
  LOWER_BODY_SESSIONS,
  PCT_TABLE,
  ROTATION,
  SESSION_TONE,
  TEMPLATES,
  ZONE2_MIN,
  type PctRow,
  type Slot,
} from '../plan';
import { TRAVEL_NOTE, TRAVEL_SESSION, TRAVEL_WEDNESDAY } from '../plan/content';
import { equipmentFor, takesLoad, type Equipment } from '../plan/exercises';
import type { DayTemplate, ISODate, LiftKey, SessionCode, TemplateExercise, Tone } from '../plan/types';
import { weekday } from './dates';
import { loadForTarget } from './formulas';
import { accessoryProgress, bodyweightOn, e1rmFor, historyFor, liftOffsetKg, type E1rmInfo } from './loads';
import { unitsOf } from './units';
import type { Data, SessionType } from './model';
import type { Position } from './position';

export type Intensity = 'full' | 'moderate' | 'light';

export interface Mods {
  type: SessionType;
  intensity: Intensity;
  spine: boolean;
  knee: boolean;
  upper: boolean;
  recovery: boolean;
  travel: boolean;
  rest: boolean;
}

export function modsForType(type: SessionType, base: Partial<Mods> = {}): Mods {
  const m: Mods = { type, intensity: 'full', spine: false, knee: false, upper: false, recovery: false, travel: false, rest: false, ...base };
  switch (type) {
    case 'Moderate': m.intensity = 'moderate'; break;
    case 'Light': m.intensity = 'light'; m.spine = true; break;
    case 'Spine-sparing': m.spine = true; break;
    case 'Knee-sparing': m.knee = true; break;
    case 'Upper only': m.upper = true; break;
    case 'Recovery': m.recovery = true; break;
    case 'Travel': m.travel = true; break;
    case 'Rest': m.rest = true; break;
    default: break;
  }
  return m;
}

export interface LoadSuggestion {
  kg: number | null;
  why: string[];
  badge: 'up' | 'hold' | 'down' | null;
  badgeText?: string;
  badgeReason?: string;
  e1rm?: E1rmInfo;
  /** Weighted pull-up variations: kg is the added load. */
  added?: boolean;
}

export interface PlannedExercise {
  key: string;
  name: string;
  originalName: string;
  sets: number;
  reps: number | string | null;
  repsTop: number | null;
  rest_s: number;
  muscles: string[];
  work_s?: number;
  loadNote?: string;
  note?: string;
  restNote?: string;
  perSide?: boolean;
  role: 'main' | 'accessory' | 'finisher' | 'test';
  lift?: LiftKey;
  equipment: Equipment;
  rir: string;
  load: LoadSuggestion | null;
  changes: string[];
  conditional?: string;
}

export interface CardioRx {
  id: string;
  label: string;
  minutes: number;
  kind: 'zone2' | 'walk' | 'easy';
  optional?: boolean;
  why?: string;
}

export interface MobilityRx {
  routine: 'daily' | 'backReset';
  minutes: number;
}

export interface TestItem {
  lift: LiftKey;
  plannedOn: ISODate;
}

export interface SessionPlan {
  date: ISODate;
  code: SessionCode | null;
  title: string;
  kind: string;
  focus: string;
  tone: Tone;
  mods: Mods;
  exercises: PlannedExercise[];
  skipped: { name: string; why: string }[];
  notes: string[];
  cardio: CardioRx[];
  mobility: MobilityRx;
  /** Main lifts to ask "how did it feel" about after the session. */
  feedbackLifts: LiftKey[];
}

// ---------------------------------------------------------------- template and lifts

export function dayTemplate(code: SessionCode, tpl: 'S' | 'H'): { day: DayTemplate; source: 'strength' | 'volume' } {
  if (tpl === 'H') {
    const v = TEMPLATES.volume_overrides.find((d) => d.code === code);
    if (v) return { day: v, source: 'volume' };
  }
  const s = TEMPLATES.strength.find((d) => d.code === code);
  if (!s) throw new Error(`No template for ${code}`);
  return { day: s, source: 'strength' };
}

const SLOTS: Slot[] = ['press', 'bench', 'pull', 'squat'];

function available(lift: LiftKey, data: Data): boolean {
  if (lift === 'ssb_squat') return !!data.profile?.safetyBar;
  if (lift === 'belt_squat') return !!data.profile?.beltSquat;
  return true;
}

/** The lift used in a slot this block: yearly rotation, a variation chosen after a plateau, gym equipment. */
export function liftForSlot(slot: Slot, pos: Pick<Position, 'year' | 'blockIndex'>, data: Data): LiftKey {
  let lift = ROTATION[slot].years[Math.min(3, pos.year - 1)];
  let chosenAt = -1;
  for (const e of data.plan) {
    if (e.kind !== 'variant' || e.deleted || e.slot !== slot) continue;
    const from = BLOCKS.findIndex((b) => b.code === e.fromBlock);
    if (from !== -1 && from <= pos.blockIndex && from >= chosenAt) {
      lift = e.lift;
      chosenAt = from;
    }
  }
  return available(lift, data) ? lift : ROTATION[slot].years[0];
}

/** The next variation in the rotation, for a plateau (5.3b.4). */
export function nextVariation(lift: LiftKey, data: Data): LiftKey | null {
  const slot = LIFTS[lift].slot;
  if (!slot) return null;
  const years = ROTATION[slot].years;
  const unique = years.filter((l, i) => years.indexOf(l) === i && available(l, data));
  if (unique.length < 2) return null;
  const at = Math.max(0, unique.indexOf(lift));
  return unique[(at + 1) % unique.length];
}

interface LiftLink {
  lift: LiftKey;
  pct?: PctRow;
  formula?: boolean;
}

function liftLink(ex: TemplateExercise, source: 'strength' | 'volume', code: SessionCode, pos: Position, data: Data): LiftLink | null {
  if (source === 'strength') {
    for (const slot of SLOTS) if (ex.name === ROTATION[slot].template) return { lift: liftForSlot(slot, pos, data), pct: PCT_TABLE[slot] };
    if (ex.name === 'Barbell Shrug') return { lift: 'shrug', pct: PCT_TABLE.shrug };
    if (ex.name === 'Barbell Hip Thrust with Bench') return { lift: 'hipthrust', pct: code === 'SPARTAN' ? PCT_TABLE.hipthrustThu : PCT_TABLE.hipthrustSat };
    return null;
  }
  if (ex.name === 'Barbell Shrug') return { lift: 'shrug', formula: true };
  if (ex.name === 'Barbell Hip Thrust with Bench') return { lift: 'hipthrust', formula: true };
  if (ex.name === 'Incline Barbell Bench Press') return { lift: 'incline_bench', formula: true };
  return null;
}

export const repsTop = (reps: number | string | null): number | null => {
  if (reps == null) return null;
  if (typeof reps === 'number') return reps;
  const nums = reps.match(/\d+/g);
  return nums ? Number(nums[nums.length - 1]) : null;
};

const isDeltOrTrap = (muscles: string[]) => muscles.some((m) => m === 'Traps' || /delts$/.test(m));
const LOWER = ['Quads', 'Glutes', 'Calves', 'Hamstrings'];
const isCurl = (name: string) => /leg curl|nordic/i.test(name);
const isCircuit = (name: string) => /goblet squat|thruster/i.test(name);

// ---------------------------------------------------------------- swaps (5.3)

type Draft = PlannedExercise & { link?: LiftLink; loadFactor?: number; skip?: string };

function spineSwap(d: Draft): void {
  const lift = d.link?.lift;
  const tag = 'Spine-sparing';
  if (lift === 'squat' || lift === 'ssb_squat') {
    Object.assign(d, { name: 'Leg Press', sets: 4, reps: 10, repsTop: 10, rest_s: 90, link: undefined, lift: undefined, role: 'accessory', note: 'Or Sled Push 4 × 20 m', loadNote: undefined, equipment: 'machine' as Equipment });
    d.changes.push(`${tag}: no load on the spine`);
  } else if (lift === 'ohp' || lift === 'seated_press') {
    Object.assign(d, { name: 'Seated Dumbbell Press', sets: 4, reps: 8, repsTop: 8, rest_s: 90, link: undefined, lift: undefined, role: 'accessory', note: 'Back supported', loadNote: undefined, equipment: 'dumbbell' as Equipment });
    d.changes.push(`${tag}: seated, back supported`);
  } else if (d.name === 'Barbell Shrug') {
    Object.assign(d, { name: 'Seated Dumbbell Shrug', link: undefined, lift: undefined, role: 'accessory', loadNote: undefined, equipment: 'dumbbell' as Equipment });
    d.changes.push(`${tag}: seated`);
  } else if (/hip thrust|back extension/i.test(d.name)) {
    d.loadFactor = 0.6;
    d.changes.push(`${tag}: 60% of usual load`);
  } else if (/carry/i.test(d.name)) {
    d.loadFactor = 0.5;
    d.changes.push(`${tag}: half load`);
  } else if (d.name === 'Kneeling Ab Wheel' || d.name === 'Body Saw') {
    Object.assign(d, { name: 'Dead Bug', equipment: 'bodyweight' as Equipment, note: undefined });
    d.changes.push(`${tag}: dead bug instead`);
  } else if (d.name === 'Weighted Standing Calf Raise') {
    Object.assign(d, { name: 'Weighted Seated Calf Raise' });
    d.changes.push(`${tag}: seated, no load on the spine`);
  } else if (isCircuit(d.name)) {
    d.skip = 'No load on the spine today';
  }
}

function kneeSwap(d: Draft): void {
  const tag = 'Knee-sparing';
  if (d.link?.lift === 'squat' || d.link?.lift === 'ssb_squat' || d.link?.lift === 'belt_squat' || d.name === 'Hack Squat') {
    Object.assign(d, { name: 'Barbell Hip Thrust with Bench', reps: 10, repsTop: 10, link: { lift: 'hipthrust', formula: true } as LiftLink, lift: 'hipthrust', role: 'main', loadNote: undefined, note: undefined, equipment: 'barbell' as Equipment });
    d.changes.push(`${tag}: hip thrust instead`);
  } else if (/split squat/i.test(d.name)) {
    Object.assign(d, { name: '45° Back Extension', reps: 12, repsTop: 12, perSide: false, note: undefined, equipment: 'weighted' as Equipment });
    d.changes.push(`${tag}: back extension instead`);
  } else if (d.name === 'Leg Press') {
    Object.assign(d, { name: 'Leg Curl', reps: 12, repsTop: 12, note: undefined, equipment: 'machine' as Equipment });
    d.changes.push(`${tag}: leg curl instead`);
  } else if (d.name === 'Sled Push') {
    Object.assign(d, { name: 'Walk', sets: 1, reps: null, repsTop: null, work_s: 600, loadNote: '10 min, easy', note: undefined, equipment: 'none' as Equipment, role: 'finisher' });
    d.changes.push(`${tag}: walk instead`);
  } else if (isCircuit(d.name)) {
    d.skip = 'No knee-heavy work today';
  }
}

function upperOnly(d: Draft, code: SessionCode | null): void {
  if (!code || !LOWER_BODY_SESSIONS.includes(code)) return;
  const lower = d.muscles.some((m) => LOWER.includes(m)) || isCircuit(d.name) || d.name === 'Sled Push';
  if (!lower) return;
  if (isCurl(d.name)) {
    d.conditional = 'Only if pain-free';
    d.changes.push('Upper only: keep if pain-free');
  } else {
    d.skip = 'Upper only: no knee work today';
  }
}

// ---------------------------------------------------------------- loads (5.4)

function mainLoad(d: Draft, pos: Position, mods: Mods, data: Data): LoadSuggestion {
  const link = d.link as LiftLink;
  const wt = pos.weekType;
  const u = unitsOf(data.profile);
  const eq = d.equipment;
  const info = e1rmFor(link.lift, pos.date, data);
  const remembered = historyFor(d.name, data.weights, pos.date).at(-1);
  if (!info) {
    return {
      kg: remembered ? remembered.kg : null,
      why: [remembered ? `No max yet. Last used ${u.w(remembered.kg)}.` : 'No max yet. Pick a load you can lift at the RIR target.'],
      badge: null,
    };
  }
  const why: string[] = [];
  const offset = liftOffsetKg(link.lift, pos.blockIndex, info.baseDate, data);
  let kg: number | null;
  let added = false;
  const e1 = info.e1rm;
  const srcText = info.source === 'test' ? 'tested' : info.source === 'benchmark' ? 'benchmark, unverified' : `90% of ${LIFTS[info.derivedFrom as LiftKey].short}`;
  if (link.pct) {
    const idx = wt.reload ? 0 : Math.min(pos.week, 5) - 1;
    let pct = link.pct.pct[idx];
    if (link.pct.cap) pct = Math.min(pct, link.pct.cap);
    if (LIFTS[link.lift].bodyweight) {
      const bw = bodyweightOn(pos.date, data);
      if (bw == null) return { kg: null, why: [`${pct}% of e1RM ${u.w(e1)} (${srcText}).`, 'Log your weight to get the added load.'], badge: null, e1rm: info };
      const total = (e1 * pct) / 100 + offset;
      kg = Math.max(0, u.roundDown(total - bw, eq));
      added = true;
      why.push(`${pct}% of e1RM ${u.w(e1)} (${srcText}) minus bodyweight ${u.w(bw)}.`);
    } else {
      kg = u.roundDown((e1 * pct) / 100 + offset, eq);
      why.push(`${pct}% of e1RM ${u.w(e1)} (${srcText})${wt.reload ? ', reload uses W1' : ''}.`);
    }
  } else {
    const reps = d.repsTop ?? 10;
    const rir = Math.max(1, wt.rirCalc);
    kg = u.roundDown(loadForTarget(e1, reps, rir) + offset, eq);
    why.push(`${reps} reps at RIR ${rir} from e1RM ${u.w(e1)} (${srcText}).`);
  }
  if (offset) why.push(`+${u.w(offset)} after a clean W5.`);
  for (const a of info.adjustments) why.push(`${a.pct > 0 ? '+' : ''}${a.pct}% on ${a.date.slice(5)}: ${a.reason}.`);

  let badge: LoadSuggestion['badge'] = null;
  let badgeReason: string | undefined;
  if (remembered?.mark === 'hard' && kg > remembered.kg) {
    kg = remembered.kg;
    badge = 'hold';
    badgeReason = 'Last session was hard: hold';
    why.push(badgeReason + '.');
  }
  // Day type and back rules are both fractions of the usual load: the stricter one applies, once.
  const dayFactor = mods.intensity === 'moderate' ? 0.9 : mods.intensity === 'light' ? 0.75 : 1;
  const factor = Math.min(dayFactor, d.loadFactor ?? 1);
  if (factor < 1) {
    kg = u.roundDown(kg * factor, eq);
    why.push(d.loadFactor && d.loadFactor <= dayFactor ? `${Math.round(factor * 100)}% of usual: back rule.` : `${Math.round(factor * 100)}%: ${mods.intensity === 'light' ? 'Light' : 'Moderate'} day.`);
  }
  let badgeText: string | undefined;
  if (!badge && remembered && kg > remembered.kg && mods.intensity === 'full' && !d.loadFactor) {
    badge = 'up';
    badgeText = `↑ +${u.w(kg - remembered.kg)}`;
    badgeReason = `Week ${pos.week} load`;
  }
  return { kg, why, badge, badgeText, badgeReason, e1rm: info, added };
}

function accessoryLoad(d: Draft, pos: Position, data: Data): LoadSuggestion | null {
  if (!takesLoad(d.equipment)) return null;
  const u = unitsOf(data.profile);
  const p = accessoryProgress(d.name, data.weights, pos.date, u);
  if (p.kg == null) return { kg: null, why: [`RIR ${d.rir}. No weight logged yet.`], badge: null };
  let kg = p.kg;
  const why = [p.reason ? `${p.reason}.` : `Last used ${u.w(p.lastKg as number)}.`];
  if (d.loadFactor) {
    kg = u.roundFor(kg * d.loadFactor, d.equipment);
    why.push(`${Math.round(d.loadFactor * 100)}% for the back.`);
  }
  const sign = p.deltaKg > 0 ? '↑ +' : p.deltaKg < 0 ? '↓ ' : '';
  return {
    kg,
    why,
    badge: p.badge,
    badgeText: p.badge === 'up' || p.badge === 'down' ? `${sign}${u.w(Math.abs(p.deltaKg))}` : p.badge === 'hold' ? 'Hold' : undefined,
    badgeReason: p.reason ?? undefined,
  };
}

// ---------------------------------------------------------------- build

export interface BuildInput {
  date: ISODate;
  /** Session served today (after swaps). Null on rest days. */
  code: SessionCode | null;
  pos: Position;
  mods: Mods;
  data: Data;
  backPain?: number;
  tests?: TestItem[];
}

const FAILURE_NOTE = 'Stop at RIR 1 or more';

export function buildSession(input: BuildInput): SessionPlan {
  const { date, pos, mods, data } = input;
  const code = mods.rest ? null : input.code;
  const wd = weekday(date);
  const year = pos.year;
  const mobility: MobilityRx = mods.recovery || (input.backPain ?? 0) >= 3 ? { routine: 'backReset', minutes: 20 } : { routine: 'daily', minutes: 10 };
  const base = { date, code, mods, skipped: [] as { name: string; why: string }[], notes: [] as string[], mobility, feedbackLifts: [] as LiftKey[] };

  if (mods.rest || !code) {
    return { ...base, code: null, title: 'Rest', kind: 'Rest day', focus: 'Walk only', tone: 'ash', exercises: [], cardio: [] };
  }
  if (mods.recovery) {
    return {
      ...base,
      title: 'Recovery',
      kind: 'No lifting today',
      focus: 'Walk, back reset, breathe',
      tone: 'ember',
      exercises: [],
      notes: ['30 to 45 min walk', '20 min back reset', '5 min breathing'],
      cardio: [{ id: 'cardio:walk', label: 'Walk 30-45 min', minutes: 30, kind: 'walk', why: 'Recovery day' }],
    };
  }
  if (mods.travel) {
    const isWed = wd === 2;
    const list = isWed ? TRAVEL_WEDNESDAY : TRAVEL_SESSION;
    return {
      ...base,
      title: 'Travel',
      kind: isWed ? 'Walk + core' : 'Hotel session',
      focus: isWed ? 'Walk 45 min, then core' : TRAVEL_NOTE,
      tone: 'gold',
      exercises: list.map((e, i) => ({
        key: `TRAVEL:${i}`,
        name: e.name,
        originalName: e.name,
        sets: e.sets,
        reps: e.reps,
        repsTop: repsTop(e.reps),
        rest_s: e.rest_s,
        muscles: e.muscles,
        perSide: e.perSide,
        role: 'accessory' as const,
        equipment: equipmentFor(e.name),
        rir: '2',
        load: null,
        changes: [],
      })),
      cardio: [isWed ? { id: 'cardio:walk', label: 'Walk 45 min', minutes: 45, kind: 'walk' } : { id: 'cardio:walk', label: 'Walk 20 min', minutes: 20, kind: 'walk' }],
    };
  }

  const { day, source } = dayTemplate(code, pos.tpl);
  const wt = pos.weekType;
  const exercises: PlannedExercise[] = [];
  const skipped: { name: string; why: string }[] = [];

  day.exercises.forEach((ex, i) => {
    const link = liftLink(ex, source, code, pos, data);
    let name = ex.name;
    const changes: string[] = [];
    if (link && LIFTS[link.lift].slot) name = LIFTS[link.lift].name;
    else if (ACCESSORY_OPTIONS[ex.name]) {
      const opts = ACCESSORY_OPTIONS[ex.name];
      name = opts[pos.blockIndex % opts.length];
    }
    const role: PlannedExercise['role'] = ex.finisher ? 'finisher' : link ? 'main' : 'accessory';
    let sets = ex.sets;
    if (wt.reload) {
      const half = Math.max(1, Math.ceil(sets / 2));
      if (half !== sets) changes.push('Reload: half the sets');
      sets = half;
    } else if (wt.extraSets && isDeltOrTrap(ex.muscles) && role !== 'finisher') {
      sets += 1;
      changes.push('+1 set this week');
    }
    if (pos.block.phase === 'mini' && role === 'accessory' && sets > 1) {
      sets -= 1;
      changes.push('Mini-cut: last set dropped');
    }
    const d: Draft = {
      key: `${code}:${i}`,
      name,
      originalName: ex.name,
      sets,
      reps: ex.reps,
      repsTop: repsTop(ex.reps),
      rest_s: ex.rest_s,
      muscles: ex.muscles,
      work_s: ex.work_s,
      loadNote: ex.load_note,
      note: ex.note,
      restNote: ex.rest_note,
      perSide: ex.per_side,
      role,
      lift: link?.lift,
      link: link ?? undefined,
      equipment: equipmentFor(name),
      rir: wt.rir,
      load: null,
      changes,
    };

    if (mods.spine) spineSwap(d);
    if (mods.knee) kneeSwap(d);
    if (mods.upper) upperOnly(d, code);
    if (mods.intensity === 'light' && d.role === 'finisher') d.skip = 'Light day: finishers skipped';
    if (d.skip) {
      skipped.push({ name: d.name, why: d.skip });
      return;
    }
    if (mods.intensity === 'moderate' && d.role === 'accessory' && d.sets > 1) {
      d.sets -= 1;
      d.changes.push('Moderate: last set dropped');
    }
    if (mods.intensity === 'light' && d.sets > 1) {
      d.sets -= 1;
      d.changes.push('Light: last set dropped');
    }
    // Never to failure on spine-loaded lifts; only cable and machine isolation may reach 0 (Volume W5).
    if (wt.isoZero) d.rir = isIsolation(d) ? '0-1' : '1';
    if (d.role === 'main' && d.rir === '1') d.note = d.note ? `${d.note}. ${FAILURE_NOTE}` : FAILURE_NOTE;

    d.load = d.link ? mainLoad(d, pos, mods, data) : accessoryLoad(d, pos, data);
    if (d.link && LIFTS[d.link.lift].slot) base.feedbackLifts.push(d.link.lift);
    const { link: _l, loadFactor: _f, skip: _s, ...clean } = d;
    exercises.push(clean);
  });

  // 3RM tests go first, only on Full days (5.3, 5.8).
  const tests = input.tests ?? [];
  const testRows: PlannedExercise[] = tests.map((t) => {
    const info = e1rmFor(t.lift, date, data);
    const aim = info ? unitsOf(data.profile).roundDown(info.e1rm / (1 + 3 / 30), 'barbell') : null;
    const bodyweight = LIFTS[t.lift].bodyweight;
    return {
      key: `test:${t.lift}`,
      name: `3RM test: ${LIFTS[t.lift].name}`,
      originalName: LIFTS[t.lift].name,
      sets: 1,
      reps: 3,
      repsTop: 3,
      rest_s: 180,
      muscles: [],
      role: 'test',
      lift: t.lift,
      equipment: equipmentFor(LIFTS[t.lift].name),
      rir: '1',
      note: 'Work up to a heavy 3. Stop when speed drops. Leave 1 in reserve. Log it in Log › Rep max.',
      load: { kg: aim && !bodyweight ? aim : null, why: aim && !bodyweight ? ['Aim near e1RM ÷ 1.1. Never grind.'] : ['Log the added load and the reps.'], badge: null },
      changes: t.plannedOn !== date ? ['Moved from an earlier day'] : [],
    };
  });

  const cardio: CardioRx[] = [];
  if (wd === 0 && mods.type === 'Full') cardio.push({ id: 'cardio:mon', label: 'Zone 2, 20 min', minutes: 20, kind: 'zone2', optional: true, why: 'Full days only, talk-test pace' });
  if (wd === 2) {
    const min = ZONE2_MIN[Math.min(4, year)];
    if (mods.intensity === 'light') cardio.push({ id: 'cardio:z2', label: 'Easy, 20 min or a walk', minutes: 20, kind: 'easy', why: 'Light day: capped at 20 min' });
    else cardio.push({ id: 'cardio:z2', label: `Zone 2, ${min} min`, minutes: min, kind: 'zone2', why: mods.intensity === 'moderate' ? 'Moderate day: stay at the easy end' : 'Talk-test pace' });
  }

  const notes: string[] = [];
  if (mods.upper && LOWER_BODY_SESSIONS.includes(code)) notes.push('Upper body only. No knee work today.');
  if (wt.reload) notes.push('Reload: half the sets, same loads.');
  return {
    ...base,
    skipped,
    title: code,
    kind: day.kind,
    focus: day.focus,
    tone: SESSION_TONE[code],
    exercises: [...testRows, ...exercises],
    notes,
    cardio,
  };
}

function isIsolation(d: PlannedExercise): boolean {
  if (d.equipment !== 'cable' && d.equipment !== 'machine') return false;
  if (/leg press|hack squat|row|pull-down|pull-up|press/i.test(d.name)) return false;
  return true;
}
