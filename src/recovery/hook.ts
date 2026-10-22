// The one seam into the session builder. Pure: it reads only its input and never mutates it.
// Nothing active on the date: the original session, untouched. Any error: a coarse, safe fallback,
// never the unprotected original.
import { LOWER_BODY_SESSIONS } from '../plan';
import { buildSessionCore, type BuildInput, type SessionPlan } from '../engine/session';
import { filterSession, finish, preBuild, stopPlan, TRAVEL_KIT } from './adapt';
import { constraintsOn, type Ctx } from './constraints';
import { applyFills, weekPlan } from './fill';
import { remainingWeeks } from './phases';
import { noSignals, provideSignals, type GoalSignals } from './signals';
import { goalLiftsOf } from './lifts';

export type Core = (input: BuildInput) => SessionPlan;

/** Takes a build input and the original builder, returns the adjusted session. */
export function recoveryHook(input: BuildInput, core: Core): SessionPlan {
  const ctx = constraintsOn(input.date, input.data);
  if (!ctx) return core(input);
  try {
    return adapt(input, core, ctx);
  } catch {
    return coarse(input, core, ctx);
  }
}

function adapt(input: BuildInput, core: Core, ctx: Ctx): SessionPlan {
  if (ctx.stop) return stopPlan(input, core, ctx);
  const pre = preBuild(input, ctx);
  const plan = core(pre);
  const kit = pre.mods.travel ? TRAVEL_KIT : null;
  const f = filterSession(plan, pre, ctx, kit);
  const week = weekPlan(input.date, input.data, core);
  const filled = applyFills(f.plan, pre, ctx, week);
  return finish(filled.plan, ctx, f, filled.added);
}

const COARSE_NOTE = 'Injury rules could not run fully. Do not load the injured area. Open Recover.';

/** The fail-safe: upper body only on leg days with a leg injury, a stop on red flags, and a plain warning. */
function coarse(input: BuildInput, core: Core, ctx: Ctx): SessionPlan {
  try {
    if (ctx.stop || ctx.redFlag) return { ...stopPlan(input, core, { ...ctx, stop: ctx.stop ?? { tier: 'urgent-stop', why: ctx.redFlag ?? 'red flag', advice: 'Seek medical care.' } }) };
    const leg = !!input.code && LOWER_BODY_SESSIONS.includes(input.code) && ctx.lowerLimb;
    const plan = core(leg ? { ...input, mods: { ...input.mods, upper: true } } : input);
    return { ...plan, notes: [COARSE_NOTE, ...plan.notes] };
  } catch {
    const plan = core(input);
    return { ...plan, notes: [COARSE_NOTE, ...plan.notes] };
  }
}

/** What the engine tells the Goal Guardian for a date. */
function engineSignals(date: string, data: BuildInput['data']): GoalSignals {
  const ctx = constraintsOn(date, data);
  if (!ctx) return noSignals();
  const week = weekPlan(date, data, buildSessionCore);
  const goal = new Set(goalLiftsOf(date, data));
  const pausedLifts = new Map([...week.pausedLifts].filter(([l]) => goal.has(l)));
  const tradeoffs: string[] = [];
  let fills = 0;
  for (const list of week.fills.values()) for (const f of list) fills += f.sets;
  if (week.paused.size) {
    const legs = [...week.paused.keys()].join(', ');
    tradeoffs.push(fills ? `${legs} rest this week so the injury can heal; ${fills} sets moved to goal priorities, yoke first.` : `${legs} rest this week so the injury can heal.`);
  }
  if (ctx.block) tradeoffs.push(`Recovery block: lighter sessions now so fatigue clears. Pushing through it would cost more training later.`);
  const weeks = pausedLifts.size ? ctx.active.map(remainingWeeks).reduce<[number, number] | null>((a, b) => (!a ? b : [Math.max(a[0], b[0]), Math.max(a[1], b[1])]), null) : null;
  return {
    pausedMuscles: week.paused,
    pausedLifts,
    suspended: ctx.redFlag ? 'an open red flag' : ctx.block ? 'a recovery block is on' : ctx.noFill,
    redFlag: ctx.redFlag,
    tradeoffs,
    injuryWeeks: weeks,
  };
}

provideSignals(engineSignals);
