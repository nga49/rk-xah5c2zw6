import { HEAVY_SESSIONS, LOWER_BODY_SESSIONS } from '../plan';
import type { ISODate, SessionCode } from '../plan/types';
import { addDays, diffDays, formatSleep, startOfWeek } from './dates';
import { mean } from './formulas';
import type { Checkin, Data, DayRecord, SessionType } from './model';
import { SESSION_TYPES } from './model';
import { modsForType, type Mods } from './session';

export interface Deduction {
  key: string;
  points: number;
  /** Short phrase for the one-line reason. */
  phrase: string;
  /** Input and rule, for "Why?". */
  rule: string;
}

export interface Thresholds {
  full: number;
  moderate: number;
  light: number;
}

export interface Readiness {
  score: number;
  deductions: Deduction[];
  band: 'Full' | 'Moderate' | 'Light' | 'Recovery';
  thresholds: Thresholds;
  baselineActive: boolean;
}

const prevDays = (data: Data, date: ISODate, n: number): DayRecord[] => {
  const out: DayRecord[] = [];
  for (let i = 1; i <= n; i++) {
    const d = data.days.get(addDays(date, -i));
    if (d && !d.deleted) out.push(d);
  }
  return out;
};

export function thresholdsFor(offset: number): Thresholds {
  return { full: 75 + offset, moderate: 65 + offset, light: 50 + offset };
}

export function bandFor(score: number, t: Thresholds): Readiness['band'] {
  if (score >= t.full) return 'Full';
  if (score >= t.moderate) return 'Moderate';
  if (score >= t.light) return 'Light';
  return 'Recovery';
}

/** 3-night sleep average in minutes (last night plus the two before), or null without 3 nights. */
export function sleepAverage3(date: ISODate, data: Data, today?: Checkin): number | null {
  const nights: number[] = [];
  const t = today ?? data.days.get(date)?.checkin;
  if (t) nights.push(t.sleepMin);
  for (const d of prevDays(data, date, 2)) if (d.checkin) nights.push(d.checkin.sleepMin);
  return nights.length >= 3 ? (mean(nights) as number) : null;
}

/** Readiness score (5.3), with personal baselines after 14 days of data (5.3b.1). */
export function readinessScore(c: Checkin, date: ISODate, data: Data, calibrationOffset = 0): Readiness {
  const d: Deduction[] = [];
  const add = (key: string, points: number, phrase: string, rule: string) => points && d.push({ key, points, phrase, rule });

  const sleep = c.sleepMin;
  const sleepPts = sleep < 300 ? 40 : sleep < 360 ? 25 : sleep < 420 ? 10 : sleep < 450 ? 5 : 0;
  add('sleep', sleepPts, `short sleep (${formatSleep(sleep)})`, `Sleep ${formatSleep(sleep)}: -${sleepPts}`);
  const ss = c.sleepScore;
  const ssPts = ss < 50 ? 20 : ss < 70 ? 10 : ss < 80 ? 5 : 0;
  add('sleepScore', ssPts, `sleep score ${ss}`, `Sleep score ${ss}: -${ssPts}`);
  if (c.bodyBattery != null) {
    const bb = c.bodyBattery;
    const p = bb < 30 ? 15 : bb < 50 ? 5 : 0;
    add('bodyBattery', p, 'low Body Battery', `Body Battery ${bb}: -${p}`);
  }
  if (c.hrvStatus === 'low') add('hrv', 15, 'HRV low', 'HRV low: -15');
  if (c.hrvStatus === 'unbalanced') add('hrv', 5, 'HRV unbalanced', 'HRV unbalanced: -5');

  const week = prevDays(data, date, 7);
  let rhrFired = false;
  if (c.restingHr != null) {
    const rhrs = week.map((x) => x.checkin?.restingHr).filter((x): x is number => x != null);
    const avg = rhrs.length >= 3 ? (mean(rhrs) as number) : null;
    if (avg != null && c.restingHr > avg + 5) {
      rhrFired = true;
      add('rhr', 10, 'resting HR up', `Resting HR ${c.restingHr} vs 7-day ${Math.round(avg)}: -10`);
    }
  }
  const e = c.energy;
  const ePts = e <= 1 ? 25 : e === 2 ? 15 : e === 3 ? 5 : 0;
  add('energy', ePts, 'low energy', `Energy ${e}/5: -${ePts}`);
  const st = c.stress;
  const stPts = st >= 5 ? 20 : st === 4 ? 10 : 0;
  add('stress', stPts, 'high stress', `Stress ${st}/5: -${stPts}`);
  if (c.backPain >= 3 && c.backPain <= 4) add('back', 15, `back pain ${c.backPain}`, `Back pain ${c.backPain}: -15`);
  if (c.kneePain >= 3 && c.kneePain <= 4) add('knee', 10, `knee pain ${c.kneePain}`, `Knee pain ${c.kneePain}: -10`);

  const easyDays = week.filter((x) => x.readiness && (x.readiness.type === 'Light' || x.readiness.type === 'Recovery')).length;
  if (easyDays >= 3) add('load', 10, `${easyDays} easy days this week`, `${easyDays} Light or Recovery days in the last 7: -10`);
  const avg3 = sleepAverage3(date, data, c);
  if (avg3 != null && avg3 < 390) add('debt', 10, 'sleep debt', `3-night sleep average ${formatSleep(avg3)}: -10`);

  // Personal 28-day baselines, once 14 days of data exist.
  const window = prevDays(data, date, 28).filter((x) => x.checkin);
  const baselineActive = window.length >= 14;
  if (baselineActive) {
    const base = (f: (k: Checkin) => number | undefined) => mean(window.map((x) => f(x.checkin as Checkin)).filter((v): v is number => v != null));
    const bSleep = base((k) => k.sleepMin);
    if (bSleep != null && sleep <= bSleep - 60) add('bSleep', 5, 'sleep under your average', `Sleep ${formatSleep(sleep)} vs your ${formatSleep(bSleep)}: -5`);
    const bScore = base((k) => k.sleepScore);
    if (bScore != null && ss <= bScore - 10) add('bScore', 5, 'sleep score under your usual', `Sleep score ${ss} vs your ${Math.round(bScore)}: -5`);
    const bRhr = base((k) => k.restingHr);
    if (!rhrFired && bRhr != null && c.restingHr != null && c.restingHr >= bRhr + 5) add('bRhr', 5, 'resting HR above your baseline', `Resting HR ${c.restingHr} vs your ${Math.round(bRhr)}: -5`);
    const bBb = base((k) => k.bodyBattery);
    if (bBb != null && c.bodyBattery != null && c.bodyBattery <= bBb - 15) add('bBb', 5, 'Body Battery under your usual', `Body Battery ${c.bodyBattery} vs your ${Math.round(bBb)}: -5`);
  }

  const score = Math.max(0, 100 - d.reduce((s, x) => s + x.points, 0));
  const thresholds = thresholdsFor(calibrationOffset);
  return { score, deductions: d.sort((a, b) => b.points - a.points), band: bandFor(score, thresholds), thresholds, baselineActive };
}

// ---------------------------------------------------------------- calibration (5.3b.3)

export interface Calibration {
  offset: number;
  active: boolean;
  /** Weekly steps taken, newest last. */
  history: { week: ISODate; offset: number; better: number; worse: number }[];
}

const MAX_SHIFT = 5;

/**
 * After 8 weeks of check-ins, compare predicted readiness with post-session RPE, week by week.
 * Feeling better than predicted lowers the thresholds one point; worse raises them. Never beyond plus or minus 5.
 */
export function calibrationFor(date: ISODate, data: Data): Calibration {
  const checkinDates = [...data.days.values()].filter((d) => d.checkin && !d.deleted).map((d) => d.id).sort();
  const none: Calibration = { offset: 0, active: false, history: [] };
  if (!checkinDates.length) return none;
  const first = checkinDates[0];
  if (diffDays(date, first) < 56) return none;
  let start = startOfWeek(addDays(first, 56));
  const reset = data.profile?.calibrationResetAt;
  if (reset && reset > start) start = startOfWeek(reset);
  const thisWeek = startOfWeek(date);
  let offset = 0;
  const history: Calibration['history'] = [];
  for (let w = start; w < thisWeek; w = addDays(w, 7)) {
    let better = 0;
    let worse = 0;
    for (let i = 0; i < 7; i++) {
      const day = data.days.get(addDays(w, i));
      if (!day || day.deleted || !day.sessionDone || !day.readiness || day.feedback?.rpe == null) continue;
      const rpe = day.feedback.rpe;
      const feels = Object.values(day.feedback.lifts ?? {});
      const anyHard = feels.includes('hard');
      const fullLine = 75 + offset;
      if (day.readiness.score < fullLine && rpe <= 7 && !anyHard) better += 1;
      if (day.readiness.score >= fullLine && (rpe >= 9 || anyHard)) worse += 1;
    }
    if (better >= 2 && worse === 0) offset = Math.max(-MAX_SHIFT, offset - 1);
    else if (worse >= 2 && better === 0) offset = Math.min(MAX_SHIFT, offset + 1);
    history.push({ week: w, offset, better, worse });
  }
  return { offset, active: true, history };
}

// ---------------------------------------------------------------- the day's session type (5.3, 5.3b.7)

export type PainCap = 'recovery' | 'spine' | 'knee' | 'upper' | null;

export interface Decision {
  type: SessionType;
  suggested: SessionType;
  mods: Mods;
  /** One line under the badge. */
  reason: string;
  /** Inputs and rules, for "Why?". */
  why: string[];
  cap: PainCap;
  allowed: SessionType[];
  canUseFull: boolean;
  doctor: boolean;
  readiness: Readiness | null;
  overridden: boolean;
  /** No check-in yet today. */
  pending: boolean;
}

const isLower = (code: SessionCode | null) => !!code && LOWER_BODY_SESSIONS.includes(code);
const lifted = (d: DayRecord | undefined) => !!d?.sessionDone && !!d.sessionCode;
const hardDay = (d: DayRecord | undefined) => lifted(d) && (d?.readiness?.type === 'Full' || d?.readiness?.type === 'Moderate' || d?.readiness?.type === 'Spine-sparing' || d?.readiness?.type === 'Knee-sparing');

export interface DecideInput {
  date: ISODate;
  code: SessionCode | null;
  data: Data;
  calibration: Calibration;
  status: 'before' | 'active' | 'paused' | 'done';
}

export function sessionTone(type: SessionType): 'moss' | 'gold' | 'ember' | 'ash' | 'frost' {
  if (type === 'Full' || type === 'Moderate') return 'moss';
  if (type === 'Recovery') return 'ember';
  if (type === 'Rest') return 'ash';
  return 'gold';
}

export function decide(input: DecideInput): Decision {
  const { date, code, data, calibration } = input;
  const day = data.days.get(date);
  const c = day?.checkin;
  const base = (type: SessionType, reason: string, extra: Partial<Decision> = {}): Decision => ({
    type,
    suggested: type,
    mods: modsForType(type),
    reason,
    why: [],
    cap: null,
    allowed: SESSION_TYPES,
    canUseFull: false,
    doctor: false,
    readiness: null,
    overridden: false,
    pending: false,
    ...extra,
  });

  if (input.status === 'before') return base('Rest', 'The road starts Monday 19 October');
  if (input.status === 'paused') return base('Rest', 'Plan paused: walk and rest');

  const yesterday = data.days.get(addDays(date, -1));
  const back = c?.backPain ?? 0;
  const knee = c?.kneePain ?? 0;
  const radiating = !!c?.radiating;
  const doctor = (back >= 5 && (yesterday?.checkin?.backPain ?? 0) >= 5) || radiating;

  // Pain rules first: they override the score.
  let cap: PainCap = null;
  const why: string[] = [];
  if (back >= 5 || radiating) { cap = 'recovery'; why.push(radiating ? 'Pain down the leg, numbness or weakness: no lifting.' : `Back pain ${back}: no lifting.`); }
  else if (knee >= 5 && isLower(code)) { cap = 'upper'; why.push(`Knee pain ${knee} on a leg day: upper body only.`); }
  else if (back >= 3) { cap = 'spine'; why.push(`Back pain ${back}: no load on the spine.`); }
  else if (knee >= 3 && knee <= 4) { cap = 'knee'; why.push(`Knee pain ${knee}: knee-friendly swaps.`); }
  else if (knee >= 5) why.push(`Knee pain ${knee} on an upper day: train as the score allows.`);

  if (!code && cap !== 'recovery') return base('Rest', 'Rest day: walk only', { doctor, cap });

  if (day?.travelMode && cap !== 'recovery') {
    return base('Travel', 'Travel mode: hotel session', { doctor, cap, why: ['Travel mode is on for today.'] });
  }

  if (!c) {
    const d = base('Full', 'Check in to tailor today', { pending: true });
    d.mods = modsForType('Full');
    return d;
  }

  const r = readinessScore(c, date, data, calibration.offset);
  why.push(`Readiness ${r.score}: ${r.band} (lines ${r.thresholds.full} / ${r.thresholds.moderate} / ${r.thresholds.light}).`);
  for (const x of r.deductions) why.push(x.rule);

  let type: SessionType = r.band;
  let mods = modsForType(r.band);
  const reasons: string[] = r.deductions.slice(0, 2).map((x) => x.phrase);

  // Load management across the week (5.3b.7).
  const last6 = [1, 2, 3, 4, 5, 6].map((i) => data.days.get(addDays(date, -i)));
  if (code && last6.every(lifted) && type !== 'Recovery') {
    type = 'Recovery';
    mods = modsForType('Recovery');
    reasons.unshift('6 lifting days in a row');
    why.push('Keep at least one full rest day a week.');
  } else if (isLower(code) && mods.intensity !== 'light' && type !== 'Recovery') {
    const hardLegs = last6.filter((d) => hardDay(d) && isLower(d?.sessionCode ?? null)).length;
    if (hardDay(yesterday) && isLower(yesterday?.sessionCode ?? null)) {
      mods.upper = true;
      reasons.unshift('hard leg day yesterday');
      why.push('Never two hard leg days in a row.');
    } else if (hardLegs >= 2) {
      mods.upper = true;
      reasons.unshift('2 hard leg days already this week');
      why.push('No more than 2 hard leg days in 7.');
    }
  }

  // A hard RPE on a Full day: the next session of that type starts at Moderate loads (5.3b.2).
  if (code && mods.intensity === 'full' && type === 'Full') {
    const prev = lastSessionOf(code, date, data);
    if (prev?.readiness?.type === 'Full' && (prev.feedback?.rpe ?? 0) >= 9) {
      type = 'Moderate';
      mods = { ...modsForType('Moderate'), upper: mods.upper };
      reasons.unshift(`last ${code} was RPE ${prev.feedback?.rpe}`);
      why.push(`Last ${code} felt RPE ${prev.feedback?.rpe} on a Full day: Moderate loads today.`);
    }
  }

  // Apply the pain cap on top.
  if (cap === 'recovery') { type = 'Recovery'; mods = modsForType('Recovery'); }
  else if (type !== 'Recovery') {
    if (cap === 'upper') mods.upper = true;
    if (cap === 'spine') mods.spine = true;
    if (cap === 'knee') mods.knee = true;
  }
  const suggested = labelFor(type, mods);
  let finalType = suggested;
  let finalMods: Mods = { ...mods, type: suggested };
  let overridden = false;

  const allowed: SessionType[] = cap === 'recovery' ? ['Recovery'] : SESSION_TYPES;
  if (day?.override && allowed.includes(day.override) && day.override !== suggested) {
    overridden = true;
    const o = modsForType(day.override);
    // Pain swaps always stay.
    if (cap === 'spine') o.spine = true;
    if (cap === 'knee') o.knee = true;
    if (cap === 'upper') o.upper = true;
    finalMods = o;
    finalType = labelFor(day.override, o);
    finalMods.type = finalType;
  }

  const head = reasons.length ? reasons.slice(0, 2).join(' and ') : 'slept well, body ready';
  return {
    type: finalType,
    suggested,
    mods: finalMods,
    reason: overridden ? `Your call (suggested ${suggested})` : capitalize(head),
    why,
    cap,
    allowed,
    canUseFull: cap === null && suggested !== 'Full',
    doctor,
    readiness: r,
    overridden,
    pending: false,
  };
}

/** The session-type word for a set of changes: the most limiting one leads. */
export function labelFor(type: SessionType, m: Mods): SessionType {
  if (m.recovery || type === 'Recovery') return 'Recovery';
  if (m.travel) return 'Travel';
  if (m.rest) return 'Rest';
  if (m.intensity === 'light') return 'Light';
  if (m.upper) return 'Upper only';
  if (m.spine) return 'Spine-sparing';
  if (m.knee) return 'Knee-sparing';
  if (m.intensity === 'moderate') return 'Moderate';
  return 'Full';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function lastSessionOf(code: SessionCode, before: ISODate, data: Data): DayRecord | undefined {
  let best: DayRecord | undefined;
  for (const d of data.days.values()) {
    if (d.deleted || d.id >= before || !d.sessionDone || d.sessionCode !== code) continue;
    if (!best || d.id > best.id) best = d;
  }
  return best;
}

export const isHeavy = (code: SessionCode | null) => !!code && HEAVY_SESSIONS.includes(code);
