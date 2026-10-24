// Plain-language answers the screens share: can I train today, what changed, what comes next and when.
import { diffDays } from '../engine/dates';
import type { DayView } from '../engine/today';
import type { ISODate } from '../plan/types';
import type { AreaRule, Ctx } from './constraints';
import { isLowerLimb, PHASE_WORD, type Phase } from './model';
import { needsLoadingClearance } from './phases';
import { PROTECT_FLOOR_DAYS, STEP_UP } from './rules';

export const PHASE_MEANING: Record<Phase | 'stop', string> = {
  protect: 'Calm it down: nothing loads the area, walking as tolerated, pain-free movement only.',
  load: 'Rebuild tolerance: easy holds and light work for the area, while pain stays at 3/10 or less.',
  build: 'Restore strength: loading builds back toward your usual exercises.',
  return: 'Back to the plan: main lifts ramp up from lighter loads.',
  stop: 'Warning sign: get it checked before loading it again.',
};

export const PHASE_STEPS: Phase[] = ['protect', 'load', 'build', 'return'];

/** "Can I train today?" in one sentence. */
export function canTrain(view: DayView, ctx: Ctx | null): { tone: 'moss' | 'gold' | 'ember'; text: string } {
  const s = view.session;
  if (ctx?.stop || s.title === 'Paused') return { tone: 'ember', text: 'Training paused today: seek medical care first.' };
  if (!view.code) return { tone: 'moss', text: 'Rest day. Walking is fine if it feels fine.' };
  const type = view.decision.type;
  const what = type === 'Upper only' ? 'upper body only' : type === 'Full' ? 'the full session' : type.toLowerCase();
  const n = s.exercises.filter((e) => e.role !== 'test').length;
  return { tone: 'moss', text: `Yes, you can train: ${s.title}, ${what} (${n} exercise${n === 1 ? '' : 's'}).` };
}

/** What the module changed today, as short lines. */
export function changes(view: DayView): string[] {
  const s = view.session;
  const out: string[] = [];
  const paused = s.skipped.filter((x) => /^(Protected|Red flag|Clinician|Physio)/.test(x.why)).map((x) => x.name);
  if (paused.length) out.push(`Paused: ${paused.slice(0, 3).join(', ')}${paused.length > 3 ? ` and ${paused.length - 3} more` : ''}.`);
  const easier = s.exercises.filter((e) => e.key.startsWith('REC:')).map((e) => e.name);
  if (easier.length) out.push(`Swapped for easier versions: ${easier.join(', ')}.`);
  const goalSets = s.exercises.filter((e) => e.key.startsWith('GOAL:')).reduce((n, e) => n + e.sets, 0);
  if (goalSets) out.push(`Added for your goal: ${goalSets} sets, yoke first.`);
  const rehab = s.exercises.filter((e) => e.key.startsWith('REHAB:') || e.key.startsWith('RX:')).length;
  if (rehab) out.push(`${rehab} rehab exercise${rehab === 1 ? '' : 's'} for the injured area.`);
  if (s.exercises.some((e) => e.changes.some((c) => c.startsWith('Return ramp')))) out.push('Main lifts on the return ramp: lighter loads, building up each session.');
  return out;
}

/** What comes next for an injury, what it needs, and how far along it is. */
export interface Need {
  text: string;
  met: boolean;
}

export function nextStep(a: AreaRule, date: ISODate): { title: string; needs: Need[]; ready: boolean } {
  const v = a.view;
  if (a.level === 'stop') return { title: 'Next: get it checked', needs: [{ text: 'Then tap "I have been seen". If it was ticked by mistake, remove the tick.', met: false }], ready: false };
  if (v.suggestion) {
    const to = v.suggestion.to === 'cleared' ? 'cleared' : PHASE_WORD[v.suggestion.to];
    return { title: `Ready for ${to}: confirm below`, needs: v.suggestion.needsClinician ? [{ text: `${v.suggestion.needsClinician}: a clinician's go-ahead first.`, met: false }] : [], ready: true };
  }
  const days = diffDays(date, v.since);
  const lower = isLowerLimb(a.region);
  const checks = a.active.checkins.filter((c) => c.date >= v.since);
  const tests = { ...(a.injury.atLog?.tests ?? {}) };
  for (const c of a.active.checkins) Object.assign(tests, c.tests ?? {});
  const conf = a.active.checkins.at(-1)?.confidence ?? 0;
  switch (v.confirmed) {
    case 'protect': {
      const calm = checks.slice(-2).filter((c) => (c.painRest ?? 10) <= STEP_UP.toLoad.restWalkMax && (c.painWalk ?? 10) <= STEP_UP.toLoad.restWalkMax).length;
      return {
        title: 'Next: Load phase',
        needs: [
          { text: `At least ${PROTECT_FLOOR_DAYS.days} full days in Protect (${days} so far).`, met: days >= PROTECT_FLOOR_DAYS.days },
          { text: `Rest and walking pain ${STEP_UP.toLoad.restWalkMax}/10 or less on 2 check-ins in a row (now ${calm} of 2).`, met: calm >= 2 },
          ...(lower ? [{ text: 'Full weight on the leg and a straight leg raise, answered Yes in a check-in.', met: tests['full-weight-bearing'] === true && tests['straight-leg-raise'] === true }] : []),
        ],
        ready: false,
      };
    }
    case 'load': {
      const passing = Math.min(checks.filter((c) => c.painSession != null && c.painSession <= 3).length, STEP_UP.toBuild.passing);
      return {
        title: 'Next: Build phase',
        needs: [
          { text: `${STEP_UP.toBuild.days} full days in Load (${days} so far).`, met: days >= STEP_UP.toBuild.days },
          { text: `${STEP_UP.toBuild.passing} sessions with pain 3/10 or less and no worse the next morning (now ${passing} of ${STEP_UP.toBuild.passing}).`, met: passing >= STEP_UP.toBuild.passing },
        ],
        ready: false,
      };
    }
    case 'build': {
      const gate = needsLoadingClearance(a.active);
      return {
        title: 'Next: Return phase',
        needs: [
          { text: `${STEP_UP.toReturn.days} full days in Build with the pain rule kept (${days} so far).`, met: days >= STEP_UP.toReturn.days },
          { text: `Confidence ${STEP_UP.toReturn.confidence}/5 or more (now ${conf || 'not rated'}).`, met: conf >= STEP_UP.toReturn.confidence },
          ...(gate ? [{ text: `${gate}: a clinician's go-ahead.`, met: a.active.clearedLoading }] : []),
        ],
        ready: false,
      };
    }
    case 'return':
      return {
        title: 'Next: cleared',
        needs: [
          { text: 'No pain at rest, walking or in sessions.', met: false },
          { text: `Confidence ${STEP_UP.toCleared.confidence}/5 or more (now ${conf || 'not rated'}).`, met: conf >= STEP_UP.toCleared.confidence },
          { text: 'Main lifts back to their usual loads.', met: false },
        ],
        ready: false,
      };
  }
}
