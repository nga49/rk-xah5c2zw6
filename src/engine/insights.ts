import { BLOCKS, HABITS, LIFTS, ROTATION, SEASONS, TPL_LABEL } from '../plan';
import type { ISODate, LiftKey, Tone } from '../plan/types';
import { addDays, diffDays, formatSleep, startOfWeek, weekday, weekdayName } from './dates';
import { fmtKg } from './formulas';
import type { Data, SessionType } from './model';
import { live } from './model';
import type { DueTest } from './maxtests';
import type { NutritionCheck } from './nutrition';
import type { Position } from './position';
import { isHeavy, sleepAverage3 } from './readiness';
import { scheduledCode, type CardioBalance, type SwapOffer } from './schedule';
import { nextVariation } from './session';
import { habitDue } from './tasks';

export type InsightAction =
  | { kind: 'applyKcal'; block: string; offset: number; sourceId: string; reason: string }
  | { kind: 'startReload'; from: ISODate; until: ISODate }
  | { kind: 'acceptSwap'; offer: SwapOffer }
  | { kind: 'acceptVariant'; slot: 'press' | 'bench' | 'pull' | 'squat'; lift: LiftKey; fromBlock: string }
  | { kind: 'acceptOffset'; lift: LiftKey; kg: number; fromBlock: string }
  | { kind: 'startHabit'; id: string }
  | { kind: 'open'; href: string; label: string };

export interface Insight {
  id: string;
  priority: number;
  tone: Tone;
  icon: 'alert' | 'swap' | 'test' | 'reload' | 'block' | 'moon' | 'plane' | 'run' | 'plateau' | 'up' | 'food' | 'scale' | 'habit' | 'season' | 'trophy' | 'eye';
  title: string;
  body?: string;
  why: string[];
  action?: InsightAction & { label: string };
  dismissible: boolean;
  area: 'safety' | 'session' | 'nutrition' | 'habits' | 'win';
}

/** Share of due days where the habit was ticked, between two real dates. */
export function habitRate(n: number, from: ISODate, to: ISODate, data: Data): { done: number; due: number; rate: number | null } {
  let done = 0;
  let due = 0;
  const id = `habit:${n}`;
  if (HABITS[n]?.schedule === 'weekly') {
    for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) {
      due += 1;
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        if (d >= from && d <= to && data.days.get(d)?.tasks?.[id]) { done += 1; break; }
      }
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!habitDue(n, d)) continue;
      due += 1;
      if (data.days.get(d)?.tasks?.[id]) done += 1;
    }
  }
  return { done, due, rate: due ? done / due : null };
}

/** Days with any check-in in a range: a sign the app was really in use. */
const usedDays = (from: ISODate, to: ISODate, data: Data) => {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (data.days.get(d)?.checkin) n += 1;
  return n;
};

export interface InsightContext {
  date: ISODate;
  now: Date;
  pos: Position;
  data: Data;
  type: SessionType | null;
  doctor: boolean;
  offer: SwapOffer | null;
  tests: DueTest[];
  easyDays: number;
  nutrition: NutritionCheck;
  cardio: CardioBalance;
  tomorrow?: { pos: Position; code: ReturnType<typeof scheduledCode>; tests: DueTest[] };
}

export function buildInsights(ctx: InsightContext): Insight[] {
  const { date, pos, data } = ctx;
  const out: Insight[] = [];
  const day = data.days.get(date);
  const yesterday = data.days.get(addDays(date, -1));
  const active = pos.status === 'active';

  // ---------------------------------------------------------------- safety
  if (ctx.doctor) {
    out.push({
      id: `doctor:${date}`, priority: 100, tone: 'ember', icon: 'alert', area: 'safety', dismissible: false,
      title: 'Check in with your doctor or osteopath before training',
      why: [day?.checkin?.radiating ? 'Pain down the leg, numbness or weakness.' : 'Back pain 5 or more two days in a row.'],
    });
  } else if ((day?.checkin?.backPain ?? 0) >= 3 && (yesterday?.checkin?.backPain ?? 0) >= 3) {
    out.push({
      id: `back2:${date}`, priority: 90, tone: 'gold', icon: 'alert', area: 'safety', dismissible: true,
      title: 'Back pain 2 days in a row', body: 'Keep it spine-sparing and do the back reset today.',
      why: [`Back pain ${yesterday?.checkin?.backPain} yesterday, ${day?.checkin?.backPain} today.`],
    });
  }

  // ---------------------------------------------------------------- session
  if (ctx.offer) {
    out.push({
      id: ctx.offer.id, priority: 85, tone: 'frost', icon: 'swap', area: 'session', dismissible: true,
      title: `${ctx.offer.missed} today?`, body: `Missed on ${weekdayName(ctx.offer.missedOn)}. The week slides.`,
      why: ctx.offer.lines.length ? ctx.offer.lines : ['The rest of the week stays as planned.'],
      action: { kind: 'acceptSwap', offer: ctx.offer, label: `Do ${ctx.offer.missed} today` },
    });
  }
  const pending = ctx.tests.filter((t) => !t.done);
  if (pending.length) {
    const names = pending.map((t) => LIFTS[t.lift].short).join(', ');
    out.push({
      id: `test:${pos.block.code}:${pos.week}`, priority: 80, tone: 'ember', icon: 'test', area: 'session', dismissible: false,
      title: 'Test week: 3RM due', body: names,
      why: [...pending.map((t) => `${LIFTS[t.lift].short}: ${weekdayName(t.plannedOn)}`), 'Only on a Full day. Not Full? It moves to the next Full day.'],
      action: { kind: 'open', href: '#/log/max', label: 'Log a rep max' },
    });
  }
  if (active && ctx.easyDays >= 3 && !pos.weekType.reload) {
    out.push({
      id: `reload:${startOfWeek(date)}`, priority: 78, tone: 'gold', icon: 'reload', area: 'session', dismissible: true,
      title: 'Start the reload week now?', body: 'Half the sets until Sunday. Then the plan carries on.',
      why: [`${ctx.easyDays} Light or Recovery days in the last 7.`],
      action: { kind: 'startReload', from: date, until: addDays(startOfWeek(date), 6), label: 'Start reload' },
    });
  }
  if (ctx.tomorrow && ctx.tomorrow.pos.blockIndex !== pos.blockIndex && ctx.tomorrow.pos.status === 'active') {
    const nb = ctx.tomorrow.pos.block;
    out.push({
      id: `newblock:${nb.code}`, priority: 70, tone: 'moss', icon: 'block', area: 'session', dismissible: true,
      title: `New block tomorrow: ${nb.code} ${nb.name}`, body: `${TPL_LABEL[nb.tpl]} template · ${nb.kcal.toLocaleString('en-US')} kcal`,
      why: ['Preview it in Train.'],
      action: { kind: 'open', href: '#/train', label: 'Preview' },
    });
  }
  if (ctx.tomorrow && ctx.now.getHours() >= 18) {
    const code = ctx.tomorrow.code;
    const testTomorrow = ctx.tomorrow.tests.some((t) => !t.done && t.plannedOn === ctx.tomorrow?.pos.date);
    const avg = sleepAverage3(date, data);
    const poor = avg != null && avg < 420;
    if (code && (isHeavy(code) || testTomorrow)) {
      const what = testTomorrow ? 'Test day' : code === 'SPARTAN' ? 'Heavy squats' : code === 'BLADES' ? 'Heavy presses' : 'Heavy pulls';
      out.push({
        id: `ahead:${date}`, priority: poor ? 69 : 35, tone: 'frost', icon: 'eye', area: 'session', dismissible: true,
        title: poor ? `${what} tomorrow: aim for 7.5 h tonight` : `Tomorrow: ${code}`,
        why: poor && avg != null ? [`3-night sleep average ${formatSleep(avg)}.`] : ['Look-ahead after 6 pm.'],
      });
    }
  }
  const avg3 = sleepAverage3(date, data);
  if (avg3 != null && avg3 < 390) {
    out.push({
      id: `sleep:${date}`, priority: 66, tone: 'frost', icon: 'moon', area: 'session', dismissible: true,
      title: 'Sleep is the limiter this week', body: 'Lights out 7.5 h before the alarm. Phone out of the bedroom.',
      why: [`3-night average ${formatSleep(avg3)} (under 6 h 30).`],
    });
  }
  const weekStart = startOfWeek(date);
  let travel = 0;
  for (let i = 0; i < 7; i++) if (data.days.get(addDays(weekStart, i))?.travelMode) travel += 1;
  if (travel >= 3) {
    out.push({
      id: `travel:${weekStart}`, priority: 64, tone: 'gold', icon: 'plane', area: 'session', dismissible: true,
      title: 'Travel mode 3+ days this week', body: 'Pause the plan instead? The map slides, it does not break.',
      why: [`${travel} travel days since Monday.`],
      action: { kind: 'open', href: '#/train/pause', label: 'Pause plan' },
    });
  }
  if (weekday(date) === 4 && ctx.cardio.missing >= 10) {
    out.push({
      id: `cardio:${weekStart}`, priority: 62, tone: 'frost', icon: 'run', area: 'session', dismissible: true,
      title: `Cardio ${ctx.cardio.missing} min short this week`, body: 'Add it easy after VALHALLA on Saturday, or walk it on Sunday.',
      why: [`Planned ${ctx.cardio.planned} min, logged ${ctx.cardio.planned - ctx.cardio.missing} min. Never hard cardio.`],
    });
  }

  // Plateau: e1RM flat or down across two tests (5.3b.4).
  for (const slot of ['press', 'bench', 'pull', 'squat'] as const) {
    const lift = ROTATION[slot].years[Math.min(3, pos.year - 1)];
    const tests = live(data.maxes).filter((m) => m.lift === lift && m.source === 'test').sort((a, b) => (a.date < b.date ? -1 : 1));
    if (tests.length < 2) continue;
    const [a, b] = tests.slice(-2);
    const next = nextVariation(lift, data);
    const nextBlock = BLOCKS[pos.blockIndex + 1];
    const id = `plateau:${lift}:${b.date}`;
    if (b.e1rm <= a.e1rm * 1.01 && next && nextBlock && diffDays(date, b.date) <= 42) {
      const sleep = averageSleep(date, data, 28);
      out.push({
        id, priority: 61, tone: 'gold', icon: 'plateau', area: 'session', dismissible: true,
        title: `${LIFTS[lift].short} flat across 2 tests`, body: `Try ${LIFTS[next].name} next block.`,
        why: [`${fmtKg(Math.round(a.e1rm))} → ${fmtKg(Math.round(b.e1rm))} kg e1RM.`, sleep ? `Sleep 28-day average ${formatSleep(sleep)}.` : 'Log sleep to check recovery.', 'Check calories and readiness trends too.'],
        action: { kind: 'acceptVariant', slot, lift: next, fromBlock: nextBlock.code, label: 'Use it next block' },
      });
    }
  }

  // After a clean W5 on a Strength block: +2.5 kg next Strength block (5.4).
  if (active && pos.tpl === 'S' && pos.week === 6) {
    const w5Start = addDays(pos.blockStart, 28);
    const w5End = addDays(pos.blockStart, 34);
    const nextSame = BLOCKS.slice(pos.blockIndex + 1).find((b) => b.tpl === 'S');
    if (nextSame) {
      const byLift = new Map<LiftKey, boolean[]>();
      for (const w of live(data.weights)) {
        if (!w.lift || w.date < w5Start || w.date > w5End || w.assumed) continue;
        if (!LIFTS[w.lift].slot) continue;
        byLift.set(w.lift, [...(byLift.get(w.lift) ?? []), w.mark === 'clean']);
      }
      for (const [lift, marks] of byLift) {
        const id = `w5:${pos.block.code}:${lift}`;
        if (marks.length && marks.every(Boolean)) {
          out.push({
            id, priority: 60, tone: 'moss', icon: 'up', area: 'session', dismissible: true,
            title: `${LIFTS[lift].short}: W5 all clean`, body: `+2.5 kg on its loads in ${nextSame.code}?`,
            why: ['Every logged W5 session was clean.'],
            action: { kind: 'acceptOffset', lift, kg: 2.5, fromBlock: nextSame.code, label: '+2.5 kg next block' },
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------- nutrition
  const n = ctx.nutrition;
  if (n.suggestion) {
    out.push({
      id: n.suggestion.id, priority: 58, tone: 'ember', icon: 'food', area: 'nutrition', dismissible: true,
      title: `Calories: ${n.suggestion.title}`, body: 'Applies to this block. Update Yazio too.',
      why: n.suggestion.why,
      action: { kind: 'applyKcal', block: pos.block.code, offset: n.suggestion.offset, sourceId: n.suggestion.id, reason: n.suggestion.why[0], label: 'Apply' },
    });
  } else if (n.missing && active) {
    out.push({ id: `kcalmissing:${pos.block.code}:${Math.floor(pos.dayInBlock / 14)}`, priority: 54, tone: 'gold', icon: 'scale', area: 'nutrition', dismissible: true, title: 'Not enough weigh-ins to judge calories', why: [n.missing] });
  }
  const lastWeigh = live(data.body).filter((b) => b.weightKg != null && b.date <= date).map((b) => b.date).sort().at(-1);
  if (active && (!lastWeigh || diffDays(date, lastWeigh) >= 5)) {
    out.push({
      id: `weigh:${date}`, priority: 56, tone: 'gold', icon: 'scale', area: 'nutrition', dismissible: true,
      title: 'No weigh-in for 5 days', body: 'Weigh 3 mornings a week. The app uses the average.',
      why: [lastWeigh ? `Last weigh-in ${lastWeigh}.` : 'No weigh-in yet.'],
    });
  }

  // ---------------------------------------------------------------- habits
  if (active && pos.season.n > 0) {
    const s = pos.season.n;
    const thisWeek = habitRate(s, weekStart > pos.seasonStart ? weekStart : pos.seasonStart, date, data);
    const lastWeek = habitRate(s, addDays(weekStart, -7), addDays(weekStart, -1), data);
    const inUse = usedDays(addDays(date, -13), date, data) >= 7;
    if (inUse && lastWeek.rate != null && thisWeek.rate != null && lastWeek.rate < 0.5 && thisWeek.rate < 0.5 && weekStart > pos.seasonStart) {
      out.push({
        id: `smaller:${s}:${weekStart}`, priority: 45, tone: SEASONS[pos.seasonIndex].c, icon: 'habit', area: 'habits', dismissible: true,
        title: 'Make the habit smaller', body: 'Shrink it until it is easy: 5 min becomes 2 min. Add nothing new.',
        why: [`${HABITS[s]?.task}: under 50% two weeks running.`],
      });
    } else if (inUse && thisWeek.due >= 3 && thisWeek.rate != null && thisWeek.rate < 0.5) {
      out.push({
        id: `habit50:${s}:${weekStart}`, priority: 44, tone: SEASONS[pos.seasonIndex].c, icon: 'habit', area: 'habits', dismissible: true,
        title: 'Habit under 50% this week', body: pos.season.when,
        why: [`${thisWeek.done} of ${thisWeek.due} days.`],
      });
    }
    const hold = heldHabit(pos, data);
    if (hold) {
      out.push({
        id: `stack:${s}`, priority: 46, tone: 'gold', icon: 'habit', area: 'habits', dismissible: false,
        title: `Hold ${pos.season.name} for now`, body: `Keep ${SEASONS.find((x) => x.n === hold.prev)?.name} first. Never stack a new habit under 60%.`,
        why: [`${Math.round((hold.rate ?? 0) * 100)}% over the last 2 weeks.`],
        action: { kind: 'startHabit', id: `stack:${s}`, label: 'Start it anyway' },
      });
    }
  }
  const daysLeft = diffDays(pos.seasonEnd, date);
  if (active && daysLeft >= 0 && daysLeft <= 7 && pos.season.n > 0) {
    out.push({
      id: `seasonend:${pos.seasonIndex}`, priority: 42, tone: SEASONS[pos.seasonIndex].c, icon: 'season', area: 'habits', dismissible: true,
      title: `${pos.season.name} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, body: 'Prepare the score: how automatic is each habit, 1 to 10?',
      why: ['Under 6 keeps the focus next season.'],
      action: { kind: 'open', href: '#/mind/season', label: 'Score' },
    });
  }

  // ---------------------------------------------------------------- wins
  for (const m of live(data.maxes)) {
    if (m.source !== 'test' || diffDays(date, m.date) > 3 || m.date > date) continue;
    const before = live(data.maxes).filter((x) => x.lift === m.lift && x.id !== m.id && x.date <= m.date && (x.date < m.date || x.updatedAt < m.updatedAt));
    const best = before.length ? Math.max(...before.map((x) => x.e1rm)) : 0;
    if (m.e1rm > best && before.length) {
      out.push({
        id: `pr:${m.id}`, priority: 30, tone: 'gold', icon: 'trophy', area: 'win', dismissible: true,
        title: `Personal record: ${LIFTS[m.lift].short}`, body: `e1RM ${fmtKg(Math.round(m.e1rm * 10) / 10)} kg`,
        why: [`Previous best ${fmtKg(Math.round(best * 10) / 10)} kg.`],
      });
    }
  }

  return out.filter((i) => !(i.dismissible && data.dismissed.has(i.id))).sort((a, b) => b.priority - a.priority);
}

function averageSleep(date: ISODate, data: Data, days: number): number | null {
  const xs: number[] = [];
  for (let i = 0; i < days; i++) {
    const c = data.days.get(addDays(date, -i))?.checkin;
    if (c) xs.push(c.sleepMin);
  }
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Never stack a new habit while the current one is under 60% (5.3b.6). Judged on the last 2 weeks of the
 * previous season, and only when the app was in real use then. "Start it anyway" lifts the hold.
 */
export function heldHabit(pos: Position, data: Data): { prev: number; rate: number | null } | null {
  const s = pos.season.n;
  if (s <= 1 || pos.seasonDay > 84) return null;
  if (data.dismissed.has(`stack:${s}`)) return null;
  const prevSeason = [...SEASONS].slice(0, pos.seasonIndex).reverse().find((x) => x.n > 0);
  if (!prevSeason) return null;
  const end = addDays(pos.seasonStart, -1);
  const from = addDays(end, -13);
  if (usedDays(from, end, data) < 7) return null;
  const r = habitRate(prevSeason.n, from, end, data);
  if (r.rate == null || r.rate >= 0.6) return null;
  return { prev: prevSeason.n, rate: r.rate };
}
