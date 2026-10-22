import { PHASE_LABEL, PLAN_START, TPL_LABEL } from '../plan';
import type { ISODate, SessionCode } from '../plan/types';
import { addDays, formatLong, startOfWeek } from './dates';
import { buildInsights, heldHabit, type Insight } from './insights';
import { dueTests, testsForToday, type DueTest } from './maxtests';
import type { Checkin, Data } from './model';
import { nutritionCheck, targetsFor, type NutritionCheck, type Targets } from './nutrition';
import { getPosition, type Position } from './position';
import { calibrationFor, decide, sleepAverage3, type Calibration, type Decision } from './readiness';
import { cardioBalance, easyDaysInLast7, missedDayOffer, scheduledCode, walkAfterLunch, type CardioBalance, type SwapOffer } from './schedule';
import { buildSession, type SessionPlan } from './session';
import { buildTasks, type Task } from './tasks';
import { recoveryDay } from '../recovery/day';

export interface DayView {
  date: ISODate;
  pos: Position;
  /** Session planned for today before any offer (after accepted swaps). */
  code: SessionCode | null;
  decision: Decision;
  checkin?: Checkin;
  session: SessionPlan;
  tests: DueTest[];
  tasks: { training: Task[]; mind: Task[] };
  targets: Targets;
  nutrition: NutritionCheck;
  insights: Insight[];
  offer: SwapOffer | null;
  calibration: Calibration;
  cardio: CardioBalance;
  lines: { position: string; season: string; startsOn?: string };
}

export function positionLines(pos: Position): DayView['lines'] {
  const b = pos.block;
  const wt = pos.weekType;
  const s = pos.season;
  const seasonLine = s.review ? `Review · Year ${s.year} · Day ${pos.seasonDay} of ${pos.seasonLength}` : `Season ${s.n} · ${s.name} · Day ${pos.seasonDay} of ${pos.seasonLength}`;
  if (pos.status === 'before') {
    return {
      position: `Year 1 · Block ${b.code} ${b.name} · Week 1 of ${b.weeks} · ${wt.name} · RIR ${wt.rir}`,
      season: `Season ${s.n} · ${s.name} · Day 1 of ${pos.seasonLength}`,
      startsOn: `Starts ${formatLong(PLAN_START)}`,
    };
  }
  const paused = pos.status === 'paused' ? ' · Paused' : '';
  return {
    position: `Year ${pos.year} · Block ${b.code} ${b.name} · Week ${pos.week} of ${b.weeks} · ${wt.name} · RIR ${wt.rir}${paused}`,
    season: seasonLine,
  };
}

export const blockSummary = (pos: Position) => `${TPL_LABEL[pos.tpl]} · ${PHASE_LABEL[pos.block.phase]}`;

export function computeDay(date: ISODate, data: Data, now: Date = new Date()): DayView {
  const pos = getPosition(date, data.plan);
  const calibration = calibrationFor(date, data);
  const code = pos.status === 'active' ? scheduledCode(date, data) : null;
  // Recovery module day adapter: null when the module is off or nothing is active.
  const rx = recoveryDay(date, data);
  const decided = decide({ date, code, data, calibration, status: pos.status });
  const decision = rx ? rx.decision(decided, code) : decided;
  const offered = pos.status === 'active' ? missedDayOffer(date, data, decision.type, PLAN_START) : null;
  const offer = rx ? rx.offer(offered) : offered;
  const tests = rx ? rx.tests(dueTests(pos, data)) : dueTests(pos, data);
  const todaysTests = rx ? rx.tests(testsForToday(pos, data, decision.type)) : testsForToday(pos, data, decision.type);
  const checkin = data.days.get(date)?.checkin;
  const session = buildSession({ date, code, pos, mods: decision.mods, data, backPain: checkin?.backPain, tests: todaysTests });
  const targets = targetsFor(pos, data);
  const nutrition = nutritionCheck(pos, data);
  const recoveryWednesday = data.days.get(addDays(startOfWeek(date), 2))?.readiness?.type === 'Recovery';
  const cardio = cardioBalance(date, data, pos.year, recoveryWednesday);
  const avg3 = sleepAverage3(date, data);
  const hold = heldHabit(pos, data);
  const builtTasks = buildTasks({
    date,
    pos,
    data,
    plan: session,
    type: decision.type,
    tests,
    protein: targets.p,
    kcal: targets.kcal,
    extraCardio: cardio.rx && pos.status === 'active' ? [cardio.rx] : [],
    sleepTask: avg3 != null && avg3 < 390,
    walkAfterLunch: walkAfterLunch(date, data),
    holdSeason: hold ? pos.season.n : null,
  });
  const tasks = rx ? rx.tasks(builtTasks, session) : builtTasks;
  const tomorrowDate = addDays(date, 1);
  const tomorrowPos = getPosition(tomorrowDate, data.plan);
  const built = buildInsights({
    date,
    now,
    pos,
    data,
    type: decision.type,
    doctor: decision.doctor,
    offer,
    tests,
    easyDays: easyDaysInLast7(date, data, decision.type),
    nutrition,
    cardio,
    tomorrow: { pos: tomorrowPos, code: tomorrowPos.status === 'active' ? scheduledCode(tomorrowDate, data) : null, tests: rx ? rx.tests(dueTests(tomorrowPos, data)) : dueTests(tomorrowPos, data) },
  });
  const insights = rx ? rx.insights(built) : built;
  return { date, pos, code, decision, checkin, session, tests, tasks, targets, nutrition, insights, offer, calibration, cardio, lines: positionLines(pos) };
}
