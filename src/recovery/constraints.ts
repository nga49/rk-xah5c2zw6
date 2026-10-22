// What the body allows on a date. Date-aware (only injuries, events and blocks active on that day), pure,
// and the single place that decides whether an exercise is kept, capped, ramped or protected.
// Order of authority, strictest wins: emergency and stop-everything red flags; area red flags; clinician
// restrictions and phase ceilings; phase rules; the existing pain caps (unchanged); Guardian fills; the plan.
import type { Data } from '../engine/model';
import type { ISODate } from '../plan/types';
import { isLowerLimb, MOVEMENT_LABEL, PHASE_WORD, REGION_LABEL, FLAG_LABEL, type Injury, type Movement, type Phase, type RecordOf, type Region } from './model';
import { FLAG_TIER, phaseView, TIER_ADVICE, type FlagTier, type PhaseView } from './phases';
import { activeInjuries, injuryName, standingLimits, type ActiveInjury } from './state';
import { tagsFor, type ExerciseTags } from './tags';

export interface AreaRule {
  injury: Injury;
  active: ActiveInjury;
  view: PhaseView;
  region: Region;
  /** Effective level today. */
  level: Phase | 'stop';
  name: string;
  /** Short label for skipped rows and notes, e.g. "Left quad · Protect". */
  label: string;
  /** Opt-in: the other leg can train on machines from Load, if walking is easy. */
  otherSide: boolean;
}

export interface LimitRule {
  injury: Injury;
  region: Region;
  moves: Movement[];
  applyToPlan: boolean;
  label: string;
}

export interface Ctx {
  date: ISODate;
  /** Pause all training: emergency or stop-everything flags. */
  stop: { tier: Extract<FlagTier, 'emergency' | 'urgent-stop'>; why: string; advice: string } | null;
  areas: AreaRule[];
  /** Movements a clinician blocked, with the reason. Always win. */
  clinician: Map<Movement, string>;
  limits: LimitRule[];
  /** An accepted recovery block (Phase 4). */
  block: RecordOf<'recoveryBlock'> | null;
  /** Why Guardian fills are off today, if they are. */
  noFill: string | null;
  /** First open red flag, worded for the Guardian. */
  redFlag: string | null;
  lowerLimb: boolean;
  lowerBack: boolean;
  active: ActiveInjury[];
}

/** Extra conditions read by other phases (wellness fatigue level). Registered, so this file stays small. */
type Extra = (date: ISODate, data: Data) => { noFill?: string | null; block?: RecordOf<'recoveryBlock'> | null };
const extras: Extra[] = [];
export function provideContext(fn: Extra): void {
  extras.push(fn);
}

function acceptedBlock(date: ISODate, data: Data): RecordOf<'recoveryBlock'> | null {
  const rows = (data.recovery?.records ?? []).filter((r): r is RecordOf<'recoveryBlock'> => r.kind === 'recoveryBlock' && r.date <= date && r.until >= date);
  return rows.sort((a, b) => a.updatedAt - b.updatedAt).at(-1) ?? null;
}

const memo = new WeakMap<Data, Map<ISODate, Ctx | null>>();

/** Constraints for a date, or null when nothing is active (the session is then exactly the original). */
export function constraintsOn(date: ISODate, data: Data): Ctx | null {
  if (!data.recovery) return null;
  let m = memo.get(data);
  if (!m) memo.set(data, (m = new Map()));
  if (m.has(date)) return m.get(date) ?? null;
  const ctx = build(date, data);
  m.set(date, ctx);
  return ctx;
}

function build(date: ISODate, data: Data): Ctx | null {
  const active = activeInjuries(date, data);
  const longTerm = standingLimits(date, data);
  let block = acceptedBlock(date, data);
  let noFill: string | null = null;
  for (const x of extras) {
    const e = x(date, data);
    if (e.block) block = e.block;
    if (e.noFill && !noFill) noFill = e.noFill;
  }
  const clinician = new Map<Movement, string>();
  const addBlocked = (i: Injury, moves: Movement[] | undefined, until: ISODate | undefined, by: string) => {
    if (!moves?.length || (until && until < date)) return;
    for (const mv of moves) if (!clinician.has(mv)) clinician.set(mv, `${by}: no ${MOVEMENT_LABEL[mv].toLowerCase()} (${injuryName(i)})`);
  };
  // Clinician restrictions never expire unless an end date was typed; after clearance they need one.
  for (const i of data.recovery?.injuries ?? []) {
    if (i.kind === 'longTerm' || i.start > date) continue;
    const isActive = active.some((a) => a.injury.id === i.id);
    if (isActive || i.restrictions?.until) addBlocked(i, i.restrictions?.blocked, i.restrictions?.until, 'Clinician');
  }
  for (const r of data.recovery?.records ?? []) {
    if (r.kind !== 'rx' || r.date > date) continue;
    const inj = data.recovery?.injuries.find((x) => x.id === r.injuryId);
    if (inj && active.some((a) => a.injury.id === inj.id)) addBlocked(inj, r.blocked, r.until, 'Physio');
  }

  const areas: AreaRule[] = active.map((a) => {
    const view = phaseView(a, date);
    const name = injuryName(a.injury);
    const level = view.effective;
    const walkEasy = (a.checkins.at(-1)?.painWalk ?? a.injury.atLog?.painWalk ?? 10) <= 2;
    const fullWeight = (a.checkins.at(-1)?.tests?.['full-weight-bearing'] ?? a.injury.atLog?.tests?.['full-weight-bearing']) === true;
    return {
      injury: a.injury, active: a, view, region: a.injury.region, level, name,
      label: level === 'stop' ? `${name} · red flag` : `${name} · ${PHASE_WORD[level]}`,
      otherSide: !!a.injury.trainOtherSide && (a.injury.side === 'left' || a.injury.side === 'right') && level !== 'stop' && level !== 'protect' && walkEasy && fullWeight,
    };
  });

  const limits: LimitRule[] = longTerm.map((i) => ({ injury: i, region: i.region, moves: i.restrictions?.blocked ?? [], applyToPlan: !!i.applyToPlan, label: `${injuryName(i)} · long-term limit` }));

  let stop: Ctx['stop'] = null;
  let redFlag: string | null = null;
  for (const a of areas) {
    for (const f of a.view.flags) {
      redFlag ??= `${FLAG_LABEL[f]} (${a.name})`;
      const tier = FLAG_TIER[f];
      if ((tier === 'emergency' || tier === 'urgent-stop') && (!stop || (tier === 'emergency' && stop.tier !== 'emergency'))) {
        stop = { tier, why: `${FLAG_LABEL[f]} (${a.name})`, advice: TIER_ADVICE[tier] };
      }
    }
  }
  if (!active.length && !clinician.size && !block && !noFill && !limits.some((l) => l.applyToPlan)) return null;
  if (redFlag) noFill = 'an open red flag';
  else if (block) noFill ??= 'a recovery block is on';
  return {
    date, stop, areas, clinician, limits, block, noFill, redFlag,
    lowerLimb: areas.some((a) => isLowerLimb(a.region)),
    lowerBack: areas.some((a) => a.region === 'lower-back') || limits.some((l) => l.applyToPlan && l.region === 'lower-back'),
    active,
  };
}

// ---------------------------------------------------------------- judging one exercise

export type Verdict =
  | { ok: true; rir?: string; note?: string; ramp?: AreaRule; otherSide?: AreaRule }
  | { ok: false; why: string; area?: AreaRule };

/** Machines that work one leg at a time, for the opt-in other-side training. UNVERIFIED: cross-education is not in the science check. */
export const OTHER_SIDE_OK = new Set(['Leg Press', 'Seated Leg Curl', 'Lying Leg Curl', 'Leg Curl', 'Weighted Leg Curl']);

export interface JudgeOpts {
  /** The module adds this row (fill, regression, rehab): long-term limits always apply, and stricter shapes. */
  added?: boolean;
  /** The row is a main lift (ramps in Return; regressed in Build). */
  main?: boolean;
}

const touches = (tg: ExerciseTags | null, r: Region) => (tg ? { primary: tg.regions.includes(r), any: tg.regions.includes(r) || tg.regions2.includes(r) } : { primary: true, any: true });

/** Shapes the Guardian never adds as extra volume, for anyone: overhead, carries, heavy grip work, spinal load. */
export function unsafeFill(tg: ExerciseTags | null): string | null {
  if (!tg) return 'unknown exercise';
  if (tg.moves.includes('overhead')) return 'overhead';
  if (tg.moves.includes('carry')) return 'carry';
  if (tg.moves.includes('grip') && tg.primary.includes('Forearms')) return 'heavy grip';
  if (tg.spinalLoad === 'moderate' || tg.spinalLoad === 'high') return 'spinal load';
  return null;
}

/** Whether a served or added exercise is allowed today, and how. */
export function judge(name: string, ctx: Ctx, o: JudgeOpts = {}): Verdict {
  const tg = tagsFor(name);
  if (ctx.stop) return { ok: false, why: `Training paused: ${ctx.stop.why}` };
  for (const [mv, why] of ctx.clinician) if (!tg || tg.moves.includes(mv)) return { ok: false, why };
  for (const l of ctx.limits) {
    if (!o.added && !l.applyToPlan) continue;
    const t = touches(tg, l.region);
    if ((o.added ? t.any : t.primary) || (!tg && l.moves.length) || l.moves.some((mv) => tg?.moves.includes(mv))) return { ok: false, why: `Protected: ${l.label}` };
  }
  let rir: string | undefined;
  let note: string | undefined;
  let ramp: AreaRule | undefined;
  let otherSide: AreaRule | undefined;
  for (const a of ctx.areas) {
    const t = touches(tg, a.region);
    if (!t.any) continue;
    const region = REGION_LABEL[a.region].toLowerCase();
    if (a.otherSide && OTHER_SIDE_OK.has(name)) {
      otherSide = a;
      note = `Uninjured leg only, one leg at a time (${a.name} rests)`;
      rir = '3';
      continue;
    }
    switch (a.level) {
      case 'stop':
        return { ok: false, why: `Red flag: ${a.name}. Seek medical care`, area: a };
      case 'protect':
        return { ok: false, why: `Protected: ${a.label}`, area: a };
      case 'load':
        if (t.primary || o.added) return { ok: false, why: `Protected: ${a.label}`, area: a };
        rir = '3';
        note = `Stop if the ${region} goes above 3/10`;
        break;
      case 'build':
        if (t.primary && o.main) return { ok: false, why: `Protected: ${a.label}`, area: a };
        rir = '3';
        note = `Build phase: stop if the ${region} goes above 3/10`;
        break;
      case 'return':
        if (t.primary && o.main) ramp = a;
        rir = '3';
        note = `Return phase: stop if the ${region} goes above 3/10`;
        break;
    }
  }
  return { ok: true, rir, note, ramp, otherSide };
}
