// Phase 8: travel and gyms. Existing travel stays exactly as it was unless Smart travel is on. Synthetic only.
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates';
import type { Data } from '../src/engine/model';
import { computeDay } from '../src/engine/today';
import { guardian } from '../src/recovery/goal';
import type { RecoveryRecord } from '../src/recovery/model';
import { tagsFor } from '../src/recovery/tags';
import { jetLagDays } from '../src/recovery/travel';
import { canonical, morning } from './fixtures';
import { makeData, setDay } from './helpers';
import { event, injury, moduleData } from './recovery-helpers';

const MON = '2027-05-10';
const day = (data: Data, d: string) => computeDay(d, data, morning(d));
const smart = { id: 'settings', kind: 'settings' as const, enabled: true, smartTravel: true, updatedAt: 1 };
const trip = (over: Partial<Extract<RecoveryRecord, { kind: 'trip' }>> = {}): RecoveryRecord => ({ id: 't1', kind: 'trip', date: MON, until: addDays(MON, 4), kit: 'bodyweight', updatedAt: 1, ...over });
const YOKE = ['Traps', 'Side delts', 'Rear delts', 'Neck'];

describe('travel: Smart travel off keeps it exactly as it was', () => {
  it('a travel day with the module on and nothing active equals the original', () => {
    const plain = makeData();
    setDay(plain, MON, { travelMode: true });
    const on = moduleData();
    setDay(on, MON, { travelMode: true });
    expect(canonical(day(on, MON))).toBe(canonical(day(plain, MON)));
  });

  it('a trip record does nothing while Smart travel is off', () => {
    expect(canonical(day(moduleData({ records: [trip()] }), MON).session)).toBe(canonical(day(makeData(), MON).session));
  });

  it('the Goal Guardian says plainly that the hotel session has no yoke work', () => {
    const on = moduleData();
    setDay(on, MON, { travelMode: true });
    expect(guardian(MON, on).tradeoffs.some((t) => t.includes('no yoke work'))).toBe(true);
  });
});

describe('travel: Smart travel on', () => {
  it('a trip makes travel days, with the yoke kit first, every row tagged', () => {
    const data = moduleData({ settings: smart, records: [trip()] });
    const v = day(data, addDays(MON, 1));
    expect(v.decision.type).toBe('Travel');
    const yoke = v.session.exercises.filter((e) => e.key.startsWith('TRAVEL:yoke:'));
    expect(yoke.flatMap((e) => e.muscles)).toEqual(expect.arrayContaining(YOKE));
    for (const e of v.session.exercises) expect([e.name, !!tagsFor(e.name)]).toEqual([e.name, true]);
  });

  it('the kit decides the exercises; short sessions keep the yoke, a push and a pull', () => {
    const bands = day(moduleData({ settings: smart, records: [trip({ kit: 'bands' })] }), addDays(MON, 1)).session.exercises.map((e) => e.name);
    expect(bands).toEqual(expect.arrayContaining(['Band Shrug', 'Band Face Pull']));
    const short = day(moduleData({ settings: smart, records: [trip({ shortSessions: true })] }), addDays(MON, 1)).session.exercises;
    expect(short.map((e) => e.name).sort()).toEqual(['Backpack Lateral Raise', 'Backpack Shrug', 'Backpack or Band Row', 'Neck Isometric Holds', 'Prone Y-Raise, bodyweight', 'Push-up'].sort());
    expect(short.every((e) => e.sets <= 2)).toBe(true);
  });

  it('injuries still win on travel days, including over the yoke kit', () => {
    const inj = injury({ region: 'neck', side: 'midline', start: '2027-05-01' });
    const data = moduleData({ settings: smart, injuries: [inj], records: [trip(), event(inj, '2027-05-01', { event: 'phase', phase: 'protect' })] });
    const names = day(data, addDays(MON, 1)).session.exercises.map((e) => e.name);
    expect(names).not.toContain('Neck Isometric Holds');
    expect(names).not.toContain('Backpack Shrug');
  });

  it('flight days are rest days, with a clot prompt only after a recent leg injury on a long flight', () => {
    const quiet = day(moduleData({ settings: smart, records: [trip({ flightHours: 6 })] }), MON);
    expect(quiet.decision.type).toBe('Rest');
    expect(quiet.tasks.training.some((t) => t.id === 'rec:flight')).toBe(true);
    expect(quiet.insights.some((i) => i.id.startsWith('rec:clot:'))).toBe(false);
    const leg = injury({ region: 'calf', side: 'left', start: '2027-03-01' });
    const risky = day(moduleData({ settings: smart, injuries: [leg], records: [trip({ flightHours: 6 }), event(leg, '2027-04-01', { event: 'cleared', status: 'cleared' })] }), MON);
    expect(risky.insights.some((i) => i.id === `rec:clot:${MON}`)).toBe(true);
    const shortFlight = day(moduleData({ settings: smart, injuries: [leg], records: [trip({ flightHours: 2 })] }), MON);
    expect(shortFlight.insights.some((i) => i.id.startsWith('rec:clot:'))).toBe(false);
  });

  it('jet lag: about a day per zone east, zones over 1.5 west, for both legs of the trip', () => {
    expect(jetLagDays(6, 'east')).toBe(6);
    expect(jetLagDays(6, 'west')).toBe(4);
    const data = moduleData({ settings: smart, records: [trip({ zones: 3, direction: 'east' })] });
    expect(day(data, addDays(MON, 1)).insights.some((i) => i.id.startsWith('rec:jetlag:'))).toBe(true);
    expect(day(data, addDays(MON, 5)).insights.some((i) => i.id.startsWith('rec:jetlag:'))).toBe(true);
  });

  it('back from 4+ days away: the first two sessions are Moderate, then Full again', () => {
    const data = moduleData({ settings: smart, records: [trip({ date: addDays(MON, -7), until: addDays(MON, -2) })] });
    const first = day(data, MON);
    expect(first.decision.type).toBe('Moderate');
    expect(first.session.notes.some((n) => n.startsWith('Easier day: back from'))).toBe(true);
    setDay(data, MON, { sessionDone: true });
    setDay(data, addDays(MON, 1), { sessionDone: true });
    // The app rebuilds its data object on every change; a fresh object here, too (results are cached per object).
    expect(day({ ...data }, addDays(MON, 2)).decision.type).toBe('Full');
  });
});

describe('gyms: sessions adapt to the kit', () => {
  it('a gym without a barbell serves no barbell lifts, and says why', () => {
    const gym: RecoveryRecord = { id: 'g1', kind: 'gym', name: 'Small gym', kit: ['dumbbells', 'bench', 'cable', 'machines'], updatedAt: 1 };
    const data = moduleData({ settings: { ...smart, smartTravel: false, activeGymId: 'g1' }, records: [gym] });
    for (let i = 0; i < 6; i++) {
      const s = day(data, addDays(MON, i)).session;
      for (const e of s.exercises) if (e.role !== 'test') expect([e.name, tagsFor(e.name)!.kit.some((k) => k === 'barbell' || k === 'rack')]).toEqual([e.name, false]);
      if (i === 0) expect(s.skipped.some((x) => x.why.startsWith('Not at Small gym'))).toBe(true);
    }
  });
});
