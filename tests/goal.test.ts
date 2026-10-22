// Goal Guardian: synthetic data only.
import { describe, expect, it } from 'vitest';
import { weeklySets } from '../src/engine/audit';
import { addDays } from '../src/engine/dates';
import { buildSessionCore } from '../src/engine/session';
import { computeDay } from '../src/engine/today';
import { guardian, resolveGoal, weekVolume } from '../src/recovery/goal';
import { noSignals, provideSignals } from '../src/recovery/signals';
import { GOAL_MUSCLES, originalCounts } from '../src/recovery/volume';
import { makeData, pause, setDay } from './helpers';
import { withModule } from './recovery-flag.test';

const S_WEEK = '2026-10-26'; // M1 week 2: Strength, no reload, no extra sets

/** A user who did every session of week 1 (19 to 24 October). */
function consistent() {
  const data = withModule(makeData());
  for (let i = 0; i < 6; i++) setDay(data, addDays('2026-10-19', i), { sessionDone: true });
  return data;
}
const H_WEEK = '2027-01-18'; // M3 week 2: Volume template

describe('Goal Guardian: counting sets', () => {
  it('the plan as written counts exactly like the plan audit (Strength and Volume)', () => {
    for (const [monday, tpl] of [[S_WEEK, 'S'], [H_WEEK, 'H']] as const) {
      const counts = originalCounts(monday, makeData(), buildSessionCore);
      const audit = weeklySets(tpl);
      for (const m of GOAL_MUSCLES) expect({ m, ...(counts[m] ?? { sets: 0, days: 0 }) }).toEqual({ m, ...(audit[m] ?? { sets: 0, days: 0 }) });
    }
  });

  it('on Monday morning with nothing missed, every goal muscle is on track', () => {
    const data = withModule(makeData());
    const vol = weekVolume(S_WEEK, data);
    expect(vol.filter((v) => v.status === 'short')).toEqual([]);
    expect(vol.find((v) => v.muscle === 'Traps')).toMatchObject({ target: 10, status: 'met' });
    expect(vol.find((v) => v.muscle === 'Neck')?.target).toBe(8);
  });

  it('missed sessions earlier in the week show as short; ticks and finished sessions count', () => {
    const data = withModule(makeData());
    const thu = addDays(S_WEEK, 3);
    const short = weekVolume(thu, data);
    expect(short.some((v) => v.status === 'short')).toBe(true);
    // Finish Mon to Wed without ticking: served sets count as done.
    for (let i = 0; i < 3; i++) setDay(data, addDays(S_WEEK, i), { sessionDone: true });
    const done = weekVolume(thu, data);
    expect(done.filter((v) => v.status === 'short')).toEqual([]);
    // Ticking fewer sets than served counts only the ticked ones.
    const mon = computeDay(S_WEEK, data).session;
    const ticks = Object.fromEntries(mon.exercises.map((e) => [e.key, 0]));
    setDay(data, S_WEEK, { session: ticks });
    expect(weekVolume(thu, data).find((v) => v.muscle === 'Chest')!.performed).toBeLessThan(done.find((v) => v.muscle === 'Chest')!.performed);
  });
});

describe('Goal Guardian: the verdict', () => {
  it('derives the goal from the plan, not a stored copy', () => {
    const g = resolveGoal(makeData());
    expect(g.block).toBe('3.8');
    expect(g.weightKg[0]).toBeLessThan(89);
    expect(g.weightKg[1]).toBeGreaterThanOrEqual(89);
    expect(g.from.slice(0, 7)).toBe('2029-09');
  });

  it('says "not judged" instead of guessing when weigh-ins are missing, and gives a reason for every status', () => {
    const v = guardian(S_WEEK, consistent());
    expect(v.parts.weight.status).toBe('not-judged');
    expect(v.status).toBe('maintained');
    expect(v.reason.length).toBeGreaterThan(5);
    expect(v.range.label).toBe('Autumn 2029, on plan');
    expect(v.actions.some((a) => /Weigh in 3 mornings/.test(a))).toBe(true);
  });

  it('missed sessions make consistency honest', () => {
    const v = guardian(S_WEEK, withModule(makeData()));
    expect(v.parts.consistency.status).toBe('at-risk');
    expect(v.parts.consistency.reason).toMatch(/0 of 6 sessions/);
  });

  it('a pause moves the goal range with the plan', () => {
    const data = makeData();
    pause(data, '2026-11-02', 70);
    const g = resolveGoal(data);
    expect(g.from > resolveGoal(makeData()).from).toBe(true);
  });

  it('weight far off the curve two weeks running is at risk and widens the range', () => {
    const data = withModule(makeData());
    const d = '2026-11-12';
    for (let i = 0; i < 14; i++) data.body.push({ id: `b${i}`, date: addDays(d, -i), weightKg: 93, updatedAt: 1 });
    const v = guardian(d, data);
    expect(v.parts.weight.status).toBe('at-risk');
    expect(v.range.label).not.toBe('Autumn 2029, on plan');
  });

  it('when the slowdown comes only from protecting an injured area, it is capped at slowed and says why', () => {
    provideSignals(() => ({ ...noSignals(), pausedMuscles: new Map([['Quads', 'quad · Protect']]), pausedLifts: new Map([['squat', 'quad · Protect']]) }));
    try {
      const v = guardian(S_WEEK, consistent());
      expect(v.protective).toBe(true);
      expect(v.status).not.toBe('at-risk');
      expect(v.tradeoffs[0]).toMatch(/Slowed on purpose/);
      expect(v.paused.join(' ')).toMatch(/Squat/);
    } finally {
      provideSignals(() => noSignals());
    }
  });

  it('an open red flag is always at risk, with medical care first', () => {
    provideSignals(() => ({ ...noSignals(), redFlag: 'Cannot straighten the knee' }));
    try {
      const v = guardian(S_WEEK, withModule(makeData()));
      expect(v.status).toBe('at-risk');
      expect(v.reason).toMatch(/Medical care first/);
      expect(v.actions[0]).toMatch(/Seek medical care/);
    } finally {
      provideSignals(() => noSignals());
    }
  });
});
