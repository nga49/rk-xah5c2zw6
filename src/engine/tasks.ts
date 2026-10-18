import { DAILY_CODE, HABITS, LIFTS, MEDITATION_DOSE, SEASONS, STEPS_GOAL } from '../plan';
import type { ISODate, Tone } from '../plan/types';
import { addDays, dayOfMonth, isLastSundayOfMonth, startOfWeek, weekday } from './dates';
import { fmtInt } from './formulas';
import type { Data, DayRecord, SessionType } from './model';
import { live } from './model';
import type { DueTest } from './maxtests';
import type { Position } from './position';
import type { CardioRx, SessionPlan } from './session';

export type TaskInput = 'steps' | 'weight' | 'waist' | 'cardio' | 'mobility' | 'code';

export interface Task {
  id: string;
  label: string;
  group: 'training' | 'mind';
  tone: Tone;
  done: boolean;
  /** Fraction done, for rings and the streak strip. */
  progress: number;
  input?: TaskInput;
  target?: number;
  sub?: string;
  link?: string;
  tag?: string;
  why?: string;
  /** Ticked once for the whole week. */
  weekly?: boolean;
  /** Done is worked out from the logs (the box opens the input instead). */
  auto?: boolean;
  /** Cardio prescription behind the task. */
  cardio?: CardioRx;
}

export interface TaskContext {
  date: ISODate;
  pos: Position;
  data: Data;
  plan: SessionPlan;
  type: SessionType | null;
  tests: DueTest[];
  protein: number;
  kcal: number;
  extraCardio?: CardioRx[];
  sleepTask?: boolean;
  walkAfterLunch?: boolean;
  /** A new season habit held back until the previous one is above 60%. */
  holdSeason?: number | null;
}

const ticked = (day: DayRecord | undefined, id: string) => !!day?.tasks?.[id];

/** Habit due on this real date (6.4 schedules). */
export function habitDue(n: number, date: ISODate): boolean {
  const h = HABITS[n];
  if (!h) return false;
  switch (h.schedule) {
    case 'daily': return true;
    case 'sunday': return weekday(date) === 6;
    case 'first': return dayOfMonth(date) === 1;
    case 'friday': return weekday(date) === 4;
    case 'weekly': return true;
    case 'lastSunday': return isLastSundayOfMonth(date);
  }
}

/** Seasons whose habit is active on this plan date: the current one and every earlier one. */
export function activeHabitSeasons(planDate: ISODate): number[] {
  return SEASONS.filter((s) => s.n > 0 && s.start <= planDate).map((s) => s.n);
}

export function seasonTone(n: number): Tone {
  return SEASONS.find((s) => s.n === n)?.c ?? 'ash';
}

function weekTicked(data: Data, date: ISODate, id: string): boolean {
  const start = startOfWeek(date);
  for (let i = 0; i < 7; i++) if (ticked(data.days.get(addDays(start, i)), id)) return true;
  return false;
}

export function buildTasks(ctx: TaskContext): { training: Task[]; mind: Task[] } {
  const { date, pos, data, plan, type } = ctx;
  const day = data.days.get(date);
  const wd = weekday(date);
  const t = (task: Omit<Task, 'progress'> & { progress?: number }): Task => ({ progress: task.done ? 1 : 0, ...task });
  const training: Task[] = [];
  const mind: Task[] = [];
  const todaysBody = live(data.body).filter((b) => b.date === date);
  const cardioMin = live(data.cardio).filter((c) => c.date === date).reduce((s, c) => s + c.minutes, 0);
  const before = pos.status === 'before';
  const paused = pos.status === 'paused';

  // ---------------------------------------------------------------- training
  training.push(t({ id: 'checkin', label: 'Check-in', group: 'training', tone: 'frost', done: !!day?.checkin, sub: 'Sleep and Body Battery from Garmin', auto: true }));

  if (!before) {
    let label: string;
    if (paused) label = 'Paused · walk';
    else if (!plan.code) label = 'Rest · walk';
    else if (plan.mods.recovery) label = 'Recovery · walk, back reset, breathe';
    else label = `${plan.title} · ${type ?? plan.mods.type}`;
    training.push(t({ id: 'session', label, group: 'training', tone: plan.tone, done: !!day?.sessionDone || (!plan.code && ticked(day, 'session')), link: '#/train', sub: plan.code && !plan.mods.recovery ? plan.kind : undefined }));
  }

  const cardioRx = [...(before || paused ? [] : plan.cardio), ...(ctx.extraCardio ?? [])];
  let cardioUsed = cardioMin;
  for (const rx of cardioRx) {
    const enough = cardioUsed >= rx.minutes;
    if (enough) cardioUsed -= rx.minutes;
    training.push(t({ id: rx.id, label: rx.label, group: 'training', tone: 'frost', done: enough || ticked(day, rx.id), input: 'cardio', target: rx.minutes, sub: rx.optional ? 'Optional' : rx.why, cardio: rx, progress: Math.min(1, cardioMin / rx.minutes) }));
  }

  const mob = plan.mobility;
  const mobMin = day?.mobilityMin ?? 0;
  training.push(t({ id: 'mobility', label: mob.routine === 'backReset' ? `Back reset ${mob.minutes} min` : `Mobility ${mob.minutes} min`, group: 'training', tone: 'moss', done: mobMin >= mob.minutes || ticked(day, 'mobility'), input: 'mobility', target: mob.minutes, progress: Math.min(1, mobMin / mob.minutes) }));

  const steps = day?.steps ?? 0;
  training.push(t({ id: 'steps', label: `Steps ${fmtInt(STEPS_GOAL)}`, group: 'training', tone: 'moss', done: steps >= STEPS_GOAL, input: 'steps', target: STEPS_GOAL, progress: Math.min(1, steps / STEPS_GOAL), auto: true }));

  if (ctx.walkAfterLunch) training.push(t({ id: 'walk-lunch', label: '20 min walk after lunch', group: 'training', tone: 'moss', done: ticked(day, 'walk-lunch'), why: 'Under 6,000 steps yesterday' }));

  if (!before) training.push(t({ id: 'protein', label: `Protein ${ctx.protein} g`, group: 'training', tone: 'ember', done: ticked(day, 'protein') }));
  if (wd === 0 || wd === 2 || wd === 4) training.push(t({ id: 'weigh', label: 'Weigh-in', group: 'training', tone: 'gold', done: todaysBody.some((b) => b.weightKg != null), input: 'weight', auto: true, sub: 'Morning, after the toilet' }));
  if (wd === 6) training.push(t({ id: 'waist', label: 'Waist at the navel', group: 'training', tone: 'gold', done: todaysBody.some((b) => b.waistCm != null), input: 'waist', auto: true }));

  if (pos.status === 'active' && date === pos.blockStart) {
    training.push(t({ id: 'photos', label: 'Photos: front, side, back', group: 'training', tone: 'gold', done: ticked(day, 'photos'), sub: 'Same light, same spot' }));
    training.push(t({ id: 'yazio', label: `Update calories in Yazio to ${fmtInt(ctx.kcal)} kcal`, group: 'training', tone: 'ember', done: ticked(day, 'yazio') }));
  }

  for (const test of ctx.tests) {
    if (test.plannedOn > date && !test.done) continue;
    const moved = !test.done && test.plannedOn < date;
    const waiting = !test.done && type !== 'Full';
    training.push(t({
      id: `test:${test.lift}`,
      label: `3RM test: ${LIFTS[test.lift].short}`,
      group: 'training',
      tone: 'ember',
      done: test.done,
      auto: true,
      link: '#/log/max',
      sub: test.done ? 'Logged' : waiting ? 'Moves to the next Full day' : moved ? 'Due (moved)' : 'Due',
    }));
  }

  // ---------------------------------------------------------------- mind
  if (!before) {
    const seasons = activeHabitSeasons(pos.planDate);
    const current = pos.season.n;
    for (const n of seasons) {
      if (n === 16) continue; // "Keep" is the Sunday review below
      if (n === ctx.holdSeason) continue;
      if (!habitDue(n, date)) continue;
      const h = HABITS[n];
      const weekly = h.schedule === 'weekly';
      let label = h.task;
      if (n === 4) label = `Meditate ${MEDITATION_DOSE[Math.min(4, pos.year)]} min`;
      const id = `habit:${n}`;
      mind.push(t({
        id,
        label,
        group: 'mind',
        tone: seasonTone(n),
        done: weekly ? weekTicked(data, date, id) : ticked(day, id),
        tag: `S${n}`,
        sub: n === current ? 'This season' : weekly ? 'Once this week' : undefined,
        weekly,
      }));
    }
    const code = day?.code ?? [];
    const codeDone = code.filter(Boolean).length;
    mind.push(t({ id: 'code', label: 'Daily code', group: 'mind', tone: 'gold', done: codeDone === DAILY_CODE.length, input: 'code', progress: codeDone / DAILY_CODE.length }));
    if (ctx.sleepTask) mind.push(t({ id: 'sleep', label: 'Lights out 7.5 h before the alarm, phone out', group: 'mind', tone: 'frost', done: ticked(day, 'sleep'), why: '3-night sleep average under 6.5 h' }));
    if (wd === 6) {
      const reviewed = live(data.reviews).some((r) => r.id === startOfWeek(date));
      mind.push(t({ id: 'review', label: 'Sunday review', group: 'mind', tone: 'ash', done: reviewed, link: '#/mind/review', auto: true, tag: current === 16 ? 'S16' : undefined }));
    }
    const s3 = SEASONS.find((s) => s.n === 3);
    if (dayOfMonth(date) === 1 && s3 && pos.planDate >= s3.start) {
      mind.push(t({ id: 'monthly:voice', label: 'Record 60 s of voice', group: 'mind', tone: 'gold', done: ticked(day, 'monthly:voice') }));
      mind.push(t({ id: 'monthly:video', label: '20 s walking video', group: 'mind', tone: 'moss', done: ticked(day, 'monthly:video') }));
    }
    if (pos.block.phase === 'review' && pos.week === 1) {
      mind.push(t({ id: 'review:dexa', label: 'Book a DEXA scan', group: 'mind', tone: 'ash', done: weekTicked(data, date, 'review:dexa'), weekly: true }));
      mind.push(t({ id: 'review:letter', label: 'Write a letter to yourself', group: 'mind', tone: 'ash', done: weekTicked(data, date, 'review:letter'), weekly: true }));
      const scored = live(data.seasonScores).some((s) => s.seasonIndex === pos.seasonIndex - 1);
      mind.push(t({ id: 'review:scores', label: 'Score your season', group: 'mind', tone: 'ash', done: scored, link: '#/mind/season', auto: true }));
    }
  }
  return { training, mind };
}

/** Share of today's tasks done (the code counts by ticks). */
export function completion(tasks: Task[]): number {
  if (!tasks.length) return 0;
  return tasks.reduce((s, x) => s + (x.done ? 1 : x.input === 'code' ? x.progress : 0), 0) / tasks.length;
}
