// Day adapter: keeps the badge, tasks, test tasks, the swap card and insights consistent with the
// adjusted session. Returns null when the module is off or nothing is active, so computeDay is unchanged.
import { BLOCKS, LOWER_BODY_SESSIONS } from '../plan';
import { addDays } from '../engine/dates';
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { getPosition } from '../engine/position';
import { labelFor, type Decision } from '../engine/readiness';
import { scheduledCode, type SwapOffer } from '../engine/schedule';
import { buildSessionCore, modsForType, type SessionPlan } from '../engine/session';
import type { Task } from '../engine/tasks';
import type { ISODate, LiftKey, SessionCode } from '../plan/types';
import { testAllowed } from './adapt';
import { constraintsOn, judge, type Ctx } from './constraints';
import { FLAG_LABEL, isLowerLimb, PHASE_WORD } from './model';
import { FLAG_TIER, TIER_ADVICE } from './phases';
import { insightSources } from './registry';
import { rxDue, rxFor } from './rx';
import { flightOn, travelDecision } from './travel';
import { currentMode } from './fuel';
import { activeInjuries, checkedInToday, injuryName, type ActiveInjury } from './state';

export interface RecoveryDay {
  decision(d: Decision, code: SessionCode | null): Decision;
  offer(o: SwapOffer | null): SwapOffer | null;
  tests<T extends { lift: LiftKey }>(t: T[]): T[];
  tasks(t: { training: Task[]; mind: Task[] }, plan: SessionPlan): { training: Task[]; mind: Task[] };
  insights(list: Insight[]): Insight[];
}

/** Daily injury check-in, offered right after the readiness check-in while an injury is active. */
function checkinTasks(active: ActiveInjury[], date: ISODate): Task[] {
  return active.map((a) => {
    const done = checkedInToday(a, date);
    return {
      id: `rec:checkin:${a.injury.id}`,
      label: `Injury check-in · ${injuryName(a.injury)}`,
      group: 'training',
      tone: 'ember',
      done,
      progress: done ? 1 : 0,
      sub: '30 seconds: pain, swelling, confidence',
      link: `#/recover/checkin/${a.injury.id}`,
      auto: true,
    } satisfies Task;
  });
}

function rxTasks(ctx: Ctx, date: ISODate, data: Data): Task[] {
  const out: Task[] = [];
  for (const a of ctx.areas) {
    const rx = a.level === 'stop' ? null : rxFor(a.injury.id, date, data);
    const due = rx ? rxDue(rx, date) : [];
    if (!due.length) continue;
    const id = `rec:rx:${a.injury.id}`;
    const done = !!data.days.get(date)?.tasks?.[id];
    out.push({ id, label: `Physio exercises · ${a.name}`, group: 'training', tone: 'moss', done, progress: done ? 1 : 0, sub: due.map((it) => it.name).join(', '), link: `#/recover/injury/${a.injury.id}` });
  }
  return out;
}

function insertAfterCheckin(list: Task[], extra: Task[]): Task[] {
  const i = list.findIndex((t) => t.id === 'checkin');
  return i === -1 ? [...extra, ...list] : [...list.slice(0, i + 1), ...extra, ...list.slice(i + 1)];
}

/** Share of a session's sets that survive today's constraints, and whether any main lift is lost. */
export function survives(code: SessionCode, date: ISODate, data: Data, ctx: Ctx): { share: number; mainLost: boolean } {
  const pos = getPosition(date, data.plan);
  const s = buildSessionCore({ date, code, pos, mods: modsForType('Full'), data });
  let total = 0;
  let kept = 0;
  let mainLost = false;
  for (const e of s.exercises) {
    total += e.sets;
    const v = judge(e.name, ctx, { main: e.role === 'main' });
    if (v.ok) kept += e.sets;
    else if (e.role === 'main') mainLost = true;
  }
  return { share: total ? kept / total : 1, mainLost };
}

/** Rough daily deficit of the current block, from its planned weekly loss. APPROXIMATE: 7700 kcal per kg is a crude rule. */
function blockDeficit(date: ISODate, data: Data): { block: string; offset: number } | null {
  const pos = getPosition(date, data.plan);
  if (pos.status !== 'active' || (pos.block.phase !== 'cut' && pos.block.phase !== 'mini')) return null;
  const b = BLOCKS.find((x) => x.code === pos.block.code);
  if (!b || b.w0 <= b.w1) return null;
  const perDay = ((b.w0 - b.w1) / b.weeks) * 7700 / 7;
  return { block: b.code, offset: Math.min(500, Math.round(perDay / 50) * 50) };
}

function moduleInsights(date: ISODate, data: Data, ctx: Ctx): Insight[] {
  const out: Insight[] = [];
  for (const a of ctx.areas) {
    const id = a.injury.id;
    const flags = a.view.flags;
    if (flags.length) {
      const tier = flags.map((f) => FLAG_TIER[f]).sort((x, y) => ['emergency', 'urgent-stop', 'urgent-area', 'soon-area'].indexOf(x) - ['emergency', 'urgent-stop', 'urgent-area', 'soon-area'].indexOf(y))[0];
      out.push({
        id: `rec:flag:${id}:${date}`, priority: 100, tone: 'ember', icon: 'alert', area: 'safety', dismissible: false,
        title: tier === 'emergency' ? 'Call your emergency number now' : 'Seek medical care',
        body: `${a.name}: ${flags.map((f) => FLAG_LABEL[f]).join('; ')}.`,
        why: [TIER_ADVICE[tier], 'You logged this red flag. Not medical advice.'],
        action: { kind: 'open', href: '#/recover', label: 'Open Recover' },
      });
      continue;
    }
    if (a.view.failedToday || a.view.why.length) {
      out.push({
        id: `rec:back:${id}:${date}`, priority: 82, tone: 'gold', icon: 'alert', area: 'session', dismissible: true,
        title: `${a.name}: ${a.level === a.view.confirmed ? 'held' : `${PHASE_WORD[a.level as keyof typeof PHASE_WORD]} today`}`,
        body: 'The pain check did not pass, so today steps back. That is the plan working.',
        why: a.view.why,
      });
    }
    const s = a.view.suggestion;
    if (s) {
      const to = s.to === 'cleared' ? 'full clearance' : PHASE_WORD[s.to];
      out.push({
        id: `rec:step:${id}:${s.to}`, priority: 76, tone: 'moss', icon: 'up', area: 'session', dismissible: true,
        title: `${a.name}: ready for ${to}?`,
        body: s.needsClinician ? `${s.needsClinician}: ask your clinician first.` : 'You confirm it. The app never moves you up on its own.',
        why: [...s.basis, ...(s.needsClinician ? [`Needs a clinician's go-ahead: ${s.needsClinician}.`] : [])],
        action: { kind: 'open', href: `#/recover/injury/${id}`, label: 'Review' },
      });
    }
    // Nutrition: a suggestion to confirm, never a rule (brief, Phase 3). Through the existing calorie action.
    const def = (a.level === 'protect' || a.level === 'load') && blockDeficit(date, data);
    const sourceId = `rec:maint:${id}`;
    if (def && currentMode(date, data) === 'cut' && !live(data.kcalAdjust).some((k) => k.sourceId === sourceId) && !data.dismissed.has(sourceId)) {
      out.push({
        id: sourceId, priority: 57, tone: 'gold', icon: 'food', area: 'nutrition', dismissible: true,
        title: `Pause the cut at maintenance while it heals? +${def.offset} kcal`,
        body: 'A suggestion to confirm, not a rule. Keep protein high: at least your plan target.',
        why: [
          `Block ${def.block} plans a deficit of about ${def.offset} kcal a day (approximate: 7,700 kcal per kg is a crude rule).`,
          'Healing tissue needs energy and protein. Protein around 2.0 to 2.5 g per kg is often suggested when injured (expert review, Tipton 2015). Ask your doctor if you have kidney problems.',
          'Not medical advice.',
        ],
        action: { kind: 'applyKcal', block: def.block, offset: def.offset, sourceId, reason: `Injury: maintenance while ${a.name.toLowerCase()} heals`, label: 'Apply' },
      });
    }
  }
  return out;
}

export function recoveryDay(date: ISODate, data: Data): RecoveryDay | null {
  const r = data.recovery;
  if (!r) return null;
  const ctx = constraintsOn(date, data);
  if (!ctx) {
    // Nothing to protect, but a wellness card may still be due (a doctor prompt, a coach note).
    const extra = insightSources.flatMap((s) => s(date, data, false)).filter((i) => !(i.dismissible && data.dismissed.has(i.id)));
    if (!extra.length) return null;
    return { decision: (d) => d, offer: (o) => o, tests: (t) => t, tasks: (t) => t, insights: (list) => [...list, ...extra].sort((a, b) => b.priority - a.priority) };
  }
  const active = activeInjuries(date, data);
  const prompt = r.settings.checkinPrompt !== 'off';
  const adaptLabel = r.settings.adaptLabel !== false;

  const decision = (d0: Decision, code: SessionCode | null): Decision => {
    if (ctx.stop) {
      const d = d0;
      return {
        ...d, type: 'Recovery', suggested: 'Recovery', mods: modsForType('Recovery'), allowed: ['Recovery'], canUseFull: false,
        reason: `Seek medical care: ${ctx.stop.why}`, why: [...d.why, ctx.stop.advice, 'Not medical advice.'],
      };
    }
    const d = travelDecision(d0, date, data);
    if (d.mods.rest || d.mods.recovery || d.type === 'Rest' || d.type === 'Recovery') return d;
    if (!ctx.areas.length && !ctx.block && !ctx.ease) return d;
    const why = [...d.why, ...ctx.areas.map((a) => `${a.label}: exercises that load it are protected.`), ctx.areas.length ? 'Injury protection stays whatever you pick.' : ctx.block ? 'The recovery block stays whatever you pick.' : 'Back from travel: easier loads for the first sessions.'];
    let mods = { ...d.mods };
    if (ctx.block && mods.intensity !== 'light' && !mods.travel) {
      mods = { ...mods, intensity: ctx.block.level === 'light' ? 'light' : mods.intensity === 'full' ? 'moderate' : mods.intensity };
      why.push(`Recovery block: ${ctx.block.reason}.`);
    }
    if (ctx.ease && !ctx.block && mods.intensity === 'full' && !mods.travel) {
      mods = { ...mods, intensity: 'moderate' };
      why.push(`Easier day: ${ctx.ease}.`);
    }
    if (d.type === 'Travel' || mods.travel) return { ...d, mods, why, canUseFull: false };
    const legRest = !!code && LOWER_BODY_SESSIONS.includes(code) && ctx.areas.some((a) => isLowerLimb(a.region) && (a.level === 'stop' || a.level === 'protect' || a.level === 'load'));
    const label = labelFor(d.type, { ...mods, upper: mods.upper || legRest, spine: mods.spine || ctx.lowerBack });
    if (!adaptLabel) return { ...d, mods, why, canUseFull: false };
    const leg = ctx.areas.find((a) => isLowerLimb(a.region));
    return {
      ...d, type: label, suggested: d.overridden ? d.suggested : label, mods: { ...mods, type: label }, why, canUseFull: false,
      reason: legRest && label === 'Upper only' && !d.overridden && leg ? `${leg.name} protected: upper body today` : d.reason,
    };
  };

  return {
    decision,
    offer: (o) => {
      if (!o) return o;
      if (ctx.stop) return null;
      const s = survives(o.missed, date, data, ctx);
      return s.share < 0.5 || s.mainLost ? null : o;
    },
    tests: (t) => t.filter((x) => testAllowed(x, ctx)),
    tasks: (t, plan) => {
      let training = prompt && active.length ? insertAfterCheckin(t.training, checkinTasks(active, date)) : t.training;
      // On days with no session, a physio prescription still has its own task (on training days it is in the session).
      if (!plan.code && !ctx.stop) training = [...training, ...rxTasks(ctx, date, data)];
      const f = flightOn(date, data);
      if (f && data.recovery?.settings.smartTravel) {
        const id = 'rec:flight';
        const done = !!data.days.get(date)?.tasks?.[id];
        training = [...training, { id, label: 'Flight: walk every hour, drink water', group: 'training', tone: 'frost', done, progress: done ? 1 : 0, sub: `About ${f.flightHours} h` }];
      }
      if (ctx.stop) {
        training = training
          .filter((x) => !x.cardio && !x.id.startsWith('cardio:') && x.id !== 'steps' && x.id !== 'walk-lunch' && x.id !== 'mobility')
          .map((x) => (x.id === 'session' ? { ...x, label: 'Training paused · seek care', sub: undefined, tone: 'ember' as const } : x));
      }
      return { ...t, training };
    },
    insights: (list) => {
      const extra = [...moduleInsights(date, data, ctx), ...insightSources.flatMap((s) => s(date, data, true))];
      let out = [...list];
      // Easy days caused by module stop days are not a reason for an early reload.
      const stopDays = [...Array(7).keys()].some((i) => !!constraintsOn(addDays(date, -i), data)?.stop);
      if (stopDays) out = out.filter((x) => !x.id.startsWith('reload:'));
      const ahead = out.find((x) => x.id === `ahead:${date}`);
      if (ahead) {
        const tomorrow = addDays(date, 1);
        const code = scheduledCode(tomorrow, data);
        const tctx = constraintsOn(tomorrow, data);
        if (code && tctx && (tctx.stop || survives(code, tomorrow, data, tctx).share < 0.5)) {
          out = out.map((x) => (x === ahead ? { ...x, title: `Tomorrow: ${code}, adapted for your injury`, why: ['Look-ahead after 6 pm.', 'Protected exercises are swapped or removed; the goal muscles are kept.'] } : x));
        }
      }
      return [...out, ...extra.filter((i) => !(i.dismissible && data.dismissed.has(i.id)))].sort((a, b) => b.priority - a.priority);
    },
  };
}
