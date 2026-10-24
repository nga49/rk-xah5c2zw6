// Phases move on symptoms, never on days alone. Down is automatic and safe (a failed pain check drops a
// step for that day); up is only ever suggested, and the owner confirms it with one tap.
import { addDays, diffDays } from '../engine/dates';
import type { ISODate } from '../plan/types';
import { isLowerLimb, PHASE_WORD, type InjuryCheckin, type Phase, type RedFlag } from './model';
import { FAILURES_TO_PROTECT, minPhase, PAIN_RULE, phaseIndex, PLANNING_WEEKS, PROTECT_FLOOR_DAYS, STEP_UP, stepDown } from './rules';
import type { ActiveInjury } from './state';

export type FlagTier = 'emergency' | 'urgent-stop' | 'urgent-area' | 'soon-area';

/**
 * How each red flag is routed. The app routes; it never diagnoses.
 * Emergency and urgent-stop pause all training (walking is not prescribed for a possible clot).
 * Area flags stop everything that loads the injured area. Routing follows NHS pages on blood clots and
 * the brief's list; "cannot straighten or straight leg raise" and "pop with loss of function" go to
 * same-day care (a normal straight leg raise does not rule out a tendon injury: StatPearls).
 */
export const FLAG_TIER: Record<RedFlag, FlagTier> = {
  'chest-or-breath': 'emergency',
  'tight-limb-worsening-rest-pain': 'emergency',
  'limb-swelling-warmth': 'urgent-stop',
  'cannot-bear-weight': 'urgent-stop',
  'swelling-growing-fast': 'urgent-stop',
  'cannot-straighten-or-slr': 'urgent-area',
  'pop-with-loss-of-function': 'urgent-area',
  'pain-worse-over-days': 'soon-area',
  'numbness-spreading': 'soon-area',
  'new-on-existing': 'soon-area',
};

export const TIER_ADVICE: Record<FlagTier, string> = {
  emergency: 'Call your emergency number now.',
  'urgent-stop': 'Seek medical care today. No training until you have been seen.',
  'urgent-area': 'Seek medical care today. Nothing loads that area until then.',
  'soon-area': 'See a doctor soon. Nothing loads that area until then.',
};

const worst = (c: InjuryCheckin) => Math.max(c.painRest ?? 0, c.painWalk ?? 0);

/** Rest or walking pain rising on 3 check-ins in a row counts as "pain getting worse over days". */
export function derivedFlags(a: ActiveInjury): RedFlag[] {
  // Only check-ins after the last assessment count: being seen clears this flag like any other.
  const seen = a.events.filter((e) => e.event === 'assessed' || e.event === 'cleared').at(-1)?.date;
  const last = a.checkins.filter((c) => (!seen || c.date > seen) && (c.painRest != null || c.painWalk != null)).slice(-3);
  if (last.length === 3 && worst(last[0]) < worst(last[1]) && worst(last[1]) < worst(last[2])) return ['pain-worse-over-days'];
  return [];
}

export function flagsOf(a: ActiveInjury): RedFlag[] {
  return [...new Set([...a.flags, ...derivedFlags(a)])];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** One check-in against the pain rule. null when it holds nothing the rule can judge. */
export function painCheck(c: InjuryCheckin, before: InjuryCheckin[]): { ok: boolean | null; why: string[] } {
  const why: string[] = [];
  let judged = false;
  let ok = true;
  if (c.painSession != null) {
    judged = true;
    if (c.painSession > PAIN_RULE.sessionMax) { ok = false; why.push(`Session pain ${c.painSession}/10 (rule: ${PAIN_RULE.sessionMax} or less).`); }
  }
  const prevMorning = [...before].reverse().find((x) => x.painMorning != null)?.painMorning;
  if (c.painMorning != null && prevMorning != null) {
    judged = true;
    if (c.painMorning > prevMorning) { ok = false; why.push(`Morning pain ${c.painMorning}/10, up from ${prevMorning}.`); }
  }
  const lastWeek = [...before, c].filter((x) => diffDays(c.date, x.date) < 7).map(worst);
  const weekBefore = before.filter((x) => diffDays(c.date, x.date) >= 7 && diffDays(c.date, x.date) < 14).map(worst);
  const a = avg(lastWeek);
  const b = avg(weekBefore);
  if (lastWeek.length >= 2 && weekBefore.length >= 2 && a != null && b != null) {
    judged = true;
    if (a > b) { ok = false; why.push('Rest and walking pain higher than the week before.'); }
  }
  return { ok: judged ? ok : null, why };
}

export interface Suggestion {
  to: Phase | 'cleared';
  basis: string[];
  /** A clinician has to clear this step first. */
  needsClinician?: string;
}

export interface PhaseView {
  confirmed: Phase;
  /** Phase used today: 'stop' when a red flag stops the area. */
  effective: Phase | 'stop';
  /** Today's (or this morning's) check-in failed the pain rule. */
  failedToday: boolean;
  failures7: number;
  /** When the confirmed phase began. */
  since: ISODate;
  suggestion: Suggestion | null;
  flags: RedFlag[];
  why: string[];
}

function phaseStart(a: ActiveInjury): ISODate {
  const ev = a.events.filter((e) => e.phase).at(-1);
  return ev && ev.phase === a.phase ? ev.date : a.injury.start;
}

/** Loading the injured area again needs a clinician's go-ahead for these cases. */
export function needsLoadingClearance(a: ActiveInjury): string | null {
  const i = a.injury;
  if (i.grade === 3) return 'Grade 3 injury';
  if (i.type === 'tendon') return 'Tendon injury';
  if (i.type === 'post-surgery') return 'After surgery';
  const sudden = i.mechanism?.felt === 'snap' || i.mechanism?.felt === 'pop';
  if (sudden && (!i.grade || i.diagnosis !== 'confirmed')) return `A ${i.mechanism?.felt} with no confirmed grade`;
  return null;
}

/** Full clearance needs a clinician unless it is a minor muscle strain a clinician already graded. */
export function needsClearance(a: ActiveInjury): string | null {
  const i = a.injury;
  if (i.diagnosis === 'confirmed') return 'Diagnosis confirmed by a clinician';
  if (!i.grade) return 'Grade unknown';
  if (i.grade >= 2) return `Grade ${i.grade}`;
  if (i.type && i.type !== 'muscle') return 'Not a simple muscle strain';
  return null;
}

const latestTests = (a: ActiveInjury) => {
  const out = { ...(a.injury.atLog?.tests ?? {}) };
  for (const c of a.checkins) Object.assign(out, c.tests ?? {});
  return out;
};

export function phaseView(a: ActiveInjury, date: ISODate): PhaseView {
  const flags = flagsOf(a);
  const confirmed = a.phase;
  const since = phaseStart(a);
  const why: string[] = [];
  const checks = a.checkins.map((c, i) => ({ c, r: painCheck(c, a.checkins.slice(0, i)) }));
  const recent = checks.filter((x) => diffDays(date, x.c.date) <= 1).at(-1);
  const failedToday = recent?.r.ok === false;
  const failures7 = checks.filter((x) => diffDays(date, x.c.date) < FAILURES_TO_PROTECT.days && x.r.ok === false).length;

  let effective: Phase | 'stop' = a.phaseCap ? minPhase(confirmed, a.phaseCap) : confirmed;
  if (a.phaseCap && phaseIndex(a.phaseCap) < phaseIndex(confirmed)) why.push(`Clinician ceiling: ${PHASE_WORD[a.phaseCap]}.`);
  if (failures7 >= FAILURES_TO_PROTECT.count && effective !== 'protect') {
    effective = 'protect';
    why.push(`${failures7} failed pain checks in 7 days: back to Protect.`);
  } else if (failedToday && effective !== 'protect') {
    effective = stepDown(effective);
    why.push(...(recent?.r.why ?? []), `One step down today: ${PHASE_WORD[effective]}.`);
  }
  // Every open flag stops the area; emergency and urgent-stop flags also pause all training (constraints).
  if (flags.length) effective = 'stop';
  return { confirmed, effective, failedToday, failures7, since, suggestion: flags.length ? null : suggest(a, date, checks, confirmed, since), flags, why };
}

function suggest(a: ActiveInjury, date: ISODate, checks: { c: InjuryCheckin; r: ReturnType<typeof painCheck> }[], phase: Phase, since: ISODate): Suggestion | null {
  const daysIn = diffDays(date, since);
  const tests = latestTests(a);
  const lower = isLowerLimb(a.injury.region);
  const recent = checks.slice(-2);
  if (a.phaseCap && phaseIndex(a.phaseCap) <= phaseIndex(phase)) return null;
  if (checks.some((x) => x.c.date >= addDays(date, -1) && x.r.ok === false)) return null;
  switch (phase) {
    case 'protect': {
      if (daysIn < PROTECT_FLOOR_DAYS.days) return null;
      if (recent.length < STEP_UP.toLoad.checkins) return null;
      const calm = recent.every((x) => (x.c.painRest ?? 10) <= STEP_UP.toLoad.restWalkMax && (x.c.painWalk ?? 10) <= STEP_UP.toLoad.restWalkMax);
      if (!calm || tests['full-weight-bearing'] === false || (lower && tests['straight-leg-raise'] !== true) || (lower && tests['full-weight-bearing'] !== true)) return null;
      return { to: 'load', basis: [`${daysIn} days in Protect.`, `Rest and walking pain ${STEP_UP.toLoad.restWalkMax}/10 or less on the last 2 check-ins.`, lower ? 'Full weight-bearing and a straight leg raise reported.' : 'No red flags.'] };
    }
    case 'load': {
      const passing = checks.filter((x) => x.c.date >= since && x.c.painSession != null && x.r.ok === true).length;
      if (daysIn < STEP_UP.toBuild.days || passing < STEP_UP.toBuild.passing) return null;
      return { to: 'build', basis: [`${daysIn} days in Load.`, `${passing} sessions with pain ${PAIN_RULE.sessionMax}/10 or less and no worse the next morning.`] };
    }
    case 'build': {
      const window = checks.filter((x) => diffDays(date, x.c.date) < STEP_UP.toReturn.days);
      const conf = a.checkins.at(-1)?.confidence ?? 0;
      const failed = Object.values(tests).some((v) => v === false);
      if (daysIn < STEP_UP.toReturn.days || !window.length || window.some((x) => x.r.ok === false) || conf < STEP_UP.toReturn.confidence || failed) return null;
      const gate = needsLoadingClearance(a);
      return { to: 'return', basis: [`${daysIn} days in Build, pain rule held for 2 weeks.`, `Confidence ${conf}/5.`, 'Functional tests passed.'], needsClinician: gate && !a.clearedLoading ? gate : undefined };
    }
    case 'return': {
      const last = a.checkins.at(-1);
      if (!last || (last.painRest ?? 1) > 0 || (last.painWalk ?? 1) > 0 || (last.painSession ?? 1) > 0 || (last.confidence ?? 0) < STEP_UP.toCleared.confidence) return null;
      const gate = needsClearance(a);
      return { to: 'cleared', basis: ['Pain 0/10 at rest, walking and in sessions.', `Confidence ${last.confidence}/5.`, 'Finish the ramp first: main lifts back at full load.'], needsClinician: gate ?? undefined };
    }
  }
}

/** Rough planning range in weeks for the area to rejoin normal training, from today. UNVERIFIED (see rules). */
export function remainingWeeks(a: ActiveInjury): [number, number] {
  const i = a.injury;
  const t = i.type ?? 'unknown';
  const r = t === 'muscle' ? PLANNING_WEEKS.muscle[i.grade ?? 'unknown'] : PLANNING_WEEKS[t];
  const gone = Math.floor(a.day / 7);
  return [Math.max(0, r[0] - gone), Math.max(1, r[1] - gone)];
}
