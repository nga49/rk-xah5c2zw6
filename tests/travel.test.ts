// Characterization of the existing travel mode, written before the recovery module.
// These pin today's behaviour exactly; the module must not change any of it while inactive.
import { describe, expect, it } from 'vitest';
import { computeDay } from '../src/engine/today';
import { TRAVEL_SESSION, TRAVEL_WEDNESDAY } from '../src/plan/content';
import { checkin, makeData, pause, setDay } from './helpers';
import { historyData, morning, evening } from './fixtures';

// Week 2 of the plan: Mon 26 Oct 2026 BLADES ... Sat 31 VALHALLA, Sun 1 Nov rest.
const MON = '2026-10-26';
const WED = '2026-10-28';
const THU = '2026-10-29';
const SUN = '2026-11-01';

describe('travel mode, as it is today', () => {
  it('a scheduled day becomes the fixed hotel session, with no loads and no lift feedback', () => {
    const data = makeData();
    checkin(data, MON);
    setDay(data, MON, { travelMode: true });
    const v = computeDay(MON, data, morning(MON));
    expect(v.decision.type).toBe('Travel');
    expect(v.decision.readiness).toBeNull();
    expect(v.session.title).toBe('Travel');
    expect(v.session.kind).toBe('Hotel session');
    expect(v.session.exercises.map((e) => e.name)).toEqual(TRAVEL_SESSION.map((e) => e.name));
    expect(v.session.exercises.map((e) => e.key)).toEqual(TRAVEL_SESSION.map((_, i) => `TRAVEL:${i}`));
    expect(v.session.exercises.every((e) => e.load === null && e.rir === '2')).toBe(true);
    expect(v.session.feedbackLifts).toEqual([]);
    expect(v.session.cardio.map((c) => c.minutes)).toEqual([20]);
  });

  it('Wednesday travel is a walk plus core', () => {
    const data = makeData();
    setDay(data, WED, { travelMode: true });
    const v = computeDay(WED, data, morning(WED));
    expect(v.session.kind).toBe('Walk + core');
    expect(v.session.exercises.map((e) => e.name)).toEqual(TRAVEL_WEDNESDAY.map((e) => e.name));
    expect(v.session.cardio.map((c) => c.minutes)).toEqual([45]);
  });

  it('pain caps below Recovery are dropped on travel days (knee 3 and back 3 still get the hotel list)', () => {
    for (const c of [{ kneePain: 3 }, { kneePain: 6 }, { backPain: 3 }]) {
      const data = makeData();
      checkin(data, THU, c);
      setDay(data, THU, { travelMode: true });
      const v = computeDay(THU, data, morning(THU));
      expect(v.decision.type).toBe('Travel');
      expect(v.session.exercises.map((e) => e.name)).toEqual(TRAVEL_SESSION.map((e) => e.name));
    }
  });

  it('a Recovery cap beats travel; a rest day and a paused day beat travel', () => {
    const back = makeData();
    checkin(back, MON, { backPain: 5 });
    setDay(back, MON, { travelMode: true });
    expect(computeDay(MON, back, morning(MON)).decision.type).toBe('Recovery');

    const leg = makeData();
    checkin(leg, MON, { radiating: true });
    setDay(leg, MON, { travelMode: true });
    expect(computeDay(MON, leg, morning(MON)).decision.type).toBe('Recovery');

    const rest = makeData();
    setDay(rest, SUN, { travelMode: true });
    expect(computeDay(SUN, rest, morning(SUN)).decision.type).toBe('Rest');

    const paused = makeData();
    pause(paused, '2026-10-25', 7);
    setDay(paused, MON, { travelMode: true });
    expect(computeDay(MON, paused, morning(MON)).decision.type).toBe('Rest');
  });

  it('an override is ignored while travel mode is on', () => {
    const data = makeData();
    checkin(data, MON);
    setDay(data, MON, { travelMode: true, override: 'Upper only' });
    const v = computeDay(MON, data, morning(MON));
    expect(v.decision.type).toBe('Travel');
    expect(v.decision.overridden).toBe(false);
  });

  it('three travel days in a week raise the pause card', () => {
    const data = makeData();
    for (const d of [MON, '2026-10-27', WED]) setDay(data, d, { travelMode: true });
    const v = computeDay(WED, data, evening(WED));
    expect(v.insights.some((i) => i.id === 'travel:2026-10-26')).toBe(true);
  });
});

describe('the synthetic history really exercises the engine', () => {
  it('has check-ins, pain days, travel runs, finished sessions, tests, swaps and a pause', () => {
    const h = historyData();
    const days = [...h.days.values()];
    expect(days.filter((d) => d.checkin).length).toBeGreaterThan(400);
    expect(days.filter((d) => (d.checkin?.backPain ?? 0) >= 3).length).toBeGreaterThan(10);
    expect(days.filter((d) => (d.checkin?.kneePain ?? 0) >= 3).length).toBeGreaterThan(10);
    expect(days.filter((d) => d.travelMode).length).toBeGreaterThan(10);
    expect(days.filter((d) => d.sessionDone).length).toBeGreaterThan(250);
    expect(days.filter((d) => d.override).length).toBeGreaterThan(5);
    expect(h.maxes.filter((m) => m.source === 'test').length).toBeGreaterThan(3);
    expect(h.plan.some((e) => e.kind === 'swap')).toBe(true);
    expect(h.plan.some((e) => e.kind === 'pause')).toBe(true);
    expect(h.weights.length).toBeGreaterThan(1000);
  });
});
