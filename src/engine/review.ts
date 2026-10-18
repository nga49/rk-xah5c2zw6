import { STEPS_GOAL } from '../plan';
import type { ISODate } from '../plan/types';
import { addDays, formatSleep, startOfWeek } from './dates';
import { fmtInt, mean, round1, weeklyAverage } from './formulas';
import { habitRate } from './insights';
import type { Data } from './model';
import { live } from './model';
import { getPosition } from './position';

export interface WeekStats {
  weekStart: ISODate;
  checkins: number;
  readiness: number | null;
  sessions: number;
  planned: number;
  sleepMin: number | null;
  steps: number | null;
  cardioMin: number;
  mobilityMin: number;
  weight: number | null;
  habit: number | null;
  habitName: string;
  code: number | null;
  backDays: number;
}

/** The week so far (Monday to `date`), auto-filled into the Sunday review. */
export function weekStats(date: ISODate, data: Data): WeekStats {
  const weekStart = startOfWeek(date);
  const days: ISODate[] = [];
  for (let d = weekStart; d <= date && d <= addDays(weekStart, 6); d = addDays(d, 1)) days.push(d);
  const recs = days.map((d) => data.days.get(d)).filter((r) => r && !r.deleted);
  const pos = getPosition(date, data.plan);
  const lifting = days.filter((d) => getPosition(d, data.plan).session).length;
  const codeTicks = recs.filter((r) => r?.code).map((r) => (r?.code ?? []).filter(Boolean).length / 5);
  const s = pos.season.n;
  return {
    weekStart,
    checkins: recs.filter((r) => r?.checkin).length,
    readiness: mean(recs.map((r) => r?.readiness?.score).filter((x): x is number => x != null)),
    sessions: recs.filter((r) => r?.sessionDone).length,
    planned: lifting,
    sleepMin: mean(recs.map((r) => r?.checkin?.sleepMin).filter((x): x is number => x != null)),
    steps: mean(recs.map((r) => r?.steps).filter((x): x is number => x != null)),
    cardioMin: live(data.cardio).filter((c) => c.date >= weekStart && c.date <= date).reduce((n, c) => n + c.minutes, 0),
    mobilityMin: recs.reduce((n, r) => n + (r?.mobilityMin ?? 0), 0),
    weight: weeklyAverage(data.body, date),
    habit: s > 0 ? habitRate(s, weekStart > pos.seasonStart ? weekStart : pos.seasonStart, date, data).rate : null,
    habitName: pos.season.name,
    code: mean(codeTicks),
    backDays: recs.filter((r) => (r?.checkin?.backPain ?? 0) >= 3).length,
  };
}

/** The engine's one-line suggestion for next week: the biggest lever first. */
export function weekSuggestion(w: WeekStats): string {
  if (w.backDays >= 2) return `Back flared on ${w.backDays} days: keep loads light, back reset daily, and look at stress.`;
  if (w.sleepMin != null && w.sleepMin < 420) return `Sleep averaged ${formatSleep(w.sleepMin)}: lights out 30 min earlier, phone out of the bedroom.`;
  if (w.habit != null && w.habit < 0.5) return `${w.habitName} at ${Math.round(w.habit * 100)}%: make it smaller, not bigger.`;
  if (w.planned && w.sessions / w.planned < 0.7) return `${w.sessions} of ${w.planned} sessions: protect Monday, Tuesday and Thursday first.`;
  if (w.steps != null && w.steps < 8000) return `Steps averaged ${fmtInt(w.steps)}: add a 20 min walk after lunch.`;
  return 'A solid week. Keep the same rhythm. Nothing new.';
}

export function statsLines(w: WeekStats): [string, string][] {
  return [
    ['Check-ins', `${w.checkins}/7`],
    ['Readiness', w.readiness != null ? `${Math.round(w.readiness)}` : 'none'],
    ['Sessions', `${w.sessions}/${w.planned}`],
    ['Sleep', w.sleepMin != null ? formatSleep(w.sleepMin) : 'none'],
    ['Steps', w.steps != null ? `${fmtInt(w.steps)} (goal ${fmtInt(STEPS_GOAL)})` : 'none'],
    ['Cardio', `${w.cardioMin} min`],
    ['Mobility', `${w.mobilityMin} min`],
    ['Weight avg', w.weight != null ? `${round1(w.weight)} kg` : 'need 3 weigh-ins'],
    ['Habit', w.habit != null ? `${w.habitName} ${Math.round(w.habit * 100)}%` : 'none'],
    ['Daily code', w.code != null ? `${Math.round(w.code * 100)}%` : 'none'],
  ];
}
