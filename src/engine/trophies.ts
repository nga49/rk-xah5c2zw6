import { BLOCKS, LIFTS, SEASONS } from '../plan';
import type { ISODate, LiftKey } from '../plan/types';
import { addDays, diffDays } from './dates';
import { weeklyAverage } from './formulas';
import { habitRate } from './insights';
import type { Data } from './model';
import { live } from './model';
import { pausesOf, realDateOf } from './position';
import { standardValues } from './stats';
import { unitsOf } from './units';

export interface Trophy {
  id: string;
  name: string;
  what: string;
  /** Date earned, or null while locked. */
  on: ISODate | null;
  tone: 'gold' | 'frost' | 'ember' | 'moss' | 'ash';
}

/** Longest run of consecutive check-in days and the date each streak milestone was reached. */
function streakDates(data: Data): Map<number, ISODate> {
  const dates = [...data.days.values()].filter((d) => d.checkin && !d.deleted).map((d) => d.id).sort();
  const reached = new Map<number, ISODate>();
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of dates) {
    run = prev && diffDays(d, prev) === 1 ? run + 1 : 1;
    for (const m of [7, 30, 100, 365]) if (run === m && !reached.has(m)) reached.set(m, d);
    prev = d;
  }
  return reached;
}

export function trophies(today: ISODate, data: Data): Trophy[] {
  const out: Trophy[] = [];
  const u = unitsOf(data.profile);
  const checkins = [...data.days.values()].filter((d) => d.checkin && !d.deleted).map((d) => d.id).sort();
  out.push({ id: 'first', name: 'First Light', what: 'First check-in', on: checkins[0] ?? null, tone: 'frost' });
  const streaks = streakDates(data);
  const names: Record<number, string> = { 7: 'Unbroken Week', 30: 'Unbroken Chain', 100: 'Hundred Dawns', 365: 'Year of Iron' };
  for (const m of [7, 30, 100, 365]) out.push({ id: `streak${m}`, name: names[m], what: `${m}-day check-in streak`, on: streaks.get(m) ?? null, tone: 'frost' });

  // First full week: 7 check-ins and all 6 sessions done, Monday to Sunday.
  let fullWeek: ISODate | null = null;
  for (const d of checkins) {
    const isMonday = new Date(`${d}T12:00:00Z`).getUTCDay() === 1;
    if (!isMonday) continue;
    const week = Array.from({ length: 7 }, (_, i) => data.days.get(addDays(d, i)));
    if (week.every((x) => x?.checkin) && week.slice(0, 6).every((x) => x?.sessionDone)) {
      fullWeek = addDays(d, 6);
      break;
    }
  }
  out.push({ id: 'fullweek', name: 'Shield Wall', what: 'First full week: 7 check-ins, 6 sessions', on: fullWeek, tone: 'gold' });

  const pauses = pausesOf(data.plan);
  for (const b of BLOCKS) {
    const start = realDateOf(b.start, pauses);
    const end = realDateOf(b.end, pauses);
    if (end > today) break;
    let done = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) if (data.days.get(d)?.sessionDone) done += 1;
    if (done >= 0.8 * b.weeks * 6) out.push({ id: `block:${b.code}`, name: `Block Forged · ${b.code}`, what: `${b.name}: 80%+ of sessions`, on: end, tone: 'ember' });
  }
  for (const [i, s] of SEASONS.entries()) {
    if (s.n === 0) continue;
    const start = realDateOf(s.start, pauses);
    const end = realDateOf(s.end, pauses);
    if (end > today) break;
    const r = habitRate(s.n, start, end, data);
    if (r.rate != null && r.rate >= 0.7) out.push({ id: `season:${i}`, name: `Rune Carved · ${s.name}`, what: 'Season habit on 70%+ of days', on: end, tone: s.c === 'ash' ? 'gold' : s.c });
  }
  for (const y of [1, 2, 3, 4]) {
    const last = [...BLOCKS].reverse().find((b) => b.year === y)!;
    const end = realDateOf(last.end, pauses);
    out.push({ id: `year${y}`, name: `Year ${y} Endured`, what: `Year ${y} completed`, on: end <= today && checkins.length ? end : null, tone: 'gold' });
  }

  // New e1RM records per lift (tests beating the previous best).
  const byLift = new Map<LiftKey, { on: ISODate; n: number }>();
  const maxes = live(data.maxes).sort((a, b) => (a.date < b.date ? -1 : 1));
  const best = new Map<LiftKey, number>();
  for (const m of maxes) {
    const prev = best.get(m.lift);
    if (m.source === 'test' && prev != null && m.e1rm > prev) byLift.set(m.lift, { on: m.date, n: (byLift.get(m.lift)?.n ?? 0) + 1 });
    best.set(m.lift, Math.max(prev ?? 0, m.e1rm));
  }
  for (const [lift, v] of byLift) out.push({ id: `pr:${lift}`, name: `New Mark · ${LIFTS[lift].short}`, what: `${v.n} e1RM record${v.n > 1 ? 's' : ''}`, on: v.on, tone: 'ember' });

  let cut: ISODate | null = null;
  let goal: ISODate | null = null;
  const weighDates = [...new Set(live(data.body).filter((b) => b.weightKg != null).map((b) => b.date))].sort();
  for (const d of weighDates) {
    const avg = weeklyAverage(data.body, d);
    if (!cut && avg != null && avg <= 84) cut = d;
  }
  for (const b of live(data.body)) {
    if (b.bfSource !== 'DEXA' || b.bodyFatPct == null || b.bodyFatPct > 15.5) continue;
    const w = b.weightKg ?? weeklyAverage(data.body, b.date, 1);
    if (w != null && w >= 88 && (!goal || b.date < goal)) goal = b.date;
  }
  out.push({ id: 'cut', name: 'Lean Wolf', what: `Cut target reached: ${u.around(84)} weekly average`, on: cut, tone: 'frost' });
  out.push({ id: 'goal', name: 'Ragnarok Reached', what: `Goal zone: ${u.around(88)}+ at 15.5% or less on a DEXA`, on: goal, tone: 'gold' });

  const sv = standardValues(today, data);
  const std: [string, string, string, boolean][] = [
    ['ohp', 'Sky Press', `Overhead press e1RM ${u.around(80)}`, (sv.ohp ?? 0) >= 80],
    ['pullup3', 'Mountain Pull', `Pull-up 3 reps with +${u.around(40)}`, (sv.pullup3 ?? 0) >= 40],
    ['farmer', 'Iron Yoke', `Farmer carry 40 m with 2 × ${u.around(50)}`, (sv.farmer ?? 0) >= 50],
    ['bench', 'Anvil Chest', 'Bench e1RM +7.5% over the verified max', sv.benchGain != null && sv.benchGain >= 0.075],
    ['neck', 'Bull Neck', `Neck +${u.around(15)} for 15 reps`, (sv.neck ?? 0) >= 15],
    ['waistHeight', 'Narrow Waist', 'Waist under half your height', sv.waistHeight != null && sv.waistHeight < 0.5],
    ['zone2', 'Long Breath', 'Zone 2 for 45 min', (sv.zone2 ?? 0) >= 45],
  ];
  for (const [key, name, what, ok] of std) out.push({ id: `std:${key}`, name, what, on: ok ? (sv.dates[key] ?? today) : null, tone: 'moss' });
  return out;
}
