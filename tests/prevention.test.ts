// Phase 6: warm-up ramps, load-spike prompts, injury patterns and the body map. Synthetic values only.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { addDays, startOfWeek } from '../src/engine/dates';
import { unitsOf } from '../src/engine/units';
import { guardian } from '../src/recovery/goal';
import type { RecordOf } from '../src/recovery/model';
import { beforeText, loadSpikes, patterns, rampCheck, suggestRamp } from '../src/recovery/prevention';
import { BodyMap } from '../src/recovery/ui/BodyMap';
import { RecoveryTrainSlot } from '../src/recovery/ui/slots';
import { checkin, makeData, setDay, weight } from './helpers';
import { event, injury, moduleData } from './recovery-helpers';

const MON = '2027-05-10';
const u = unitsOf(makeData().profile);

describe('prevention: warm-up ramps', () => {
  it('suggests a ramp from the empty bar to about 80%, and nothing for light loads', () => {
    expect(suggestRamp(100, 'barbell', u).map((s) => [s.kg, s.reps])).toEqual([[20, 10], [40, 5], [60, 3], [80, 2]]);
    expect(suggestRamp(30, 'barbell', u)).toEqual([]);
    expect(suggestRamp(20, 'weighted', u, true).map((s) => s.kg)).toEqual([0, 10]);
  });

  it('warns when the working sets start with no ramp, or after a big jump', () => {
    const w = (sets: { kg: number; reps: number; done?: boolean }[]): RecordOf<'warmup'> => ({ id: 'w', kind: 'warmup', date: MON, exercise: 'Barbell Bench Press', workKg: 100, sets, updatedAt: 1 });
    expect(rampCheck(undefined, 100, false)).toBeNull();
    expect(rampCheck(undefined, 100, true)?.tone).toBe('gold');
    expect(rampCheck(w([{ kg: 20, reps: 10, done: true }, { kg: 40, reps: 5, done: true }]), 100, true)?.text).toMatch(/Big jump/);
    expect(rampCheck(w([{ kg: 60, reps: 3, done: true }, { kg: 80, reps: 2, done: true }]), 100, true)?.tone).toBe('moss');
  });

  it('the Train slot draws nothing while the module is off', () => {
    const ex = { key: 'BLADES:0', name: 'Barbell Bench Press', originalName: 'Barbell Bench Press', sets: 3, reps: 5, repsTop: 5, rest_s: 180, muscles: ['Chest'], role: 'main' as const, equipment: 'barbell' as const, rir: '2', load: { kg: 100, why: [], badge: null }, changes: [] };
    expect(renderToStaticMarkup(createElement(RecoveryTrainSlot, { data: makeData(), date: MON, ex }))).toBe('');
  });
});

describe('prevention: load spikes are prompts, not predictions', () => {
  it('flags a lift more than 10% above its 4-week best, and 5% in the month after a clearance', () => {
    const data = moduleData();
    weight(data, addDays(MON, -20), 'Barbell Bench Press', 100, 'clean');
    weight(data, addDays(MON, -3), 'Barbell Bench Press', 112, 'clean');
    expect(loadSpikes(MON, data).map((s) => s.what)).toContain('Bench');
    const gentle = moduleData();
    weight(gentle, addDays(MON, -20), 'Barbell Bench Press', 100, 'clean');
    weight(gentle, addDays(MON, -3), 'Barbell Bench Press', 107, 'clean');
    expect(loadSpikes(MON, gentle)).toEqual([]);
    const inj = injury({ region: 'chest', side: 'right', start: addDays(MON, -40) });
    gentle.recovery!.injuries.push(inj);
    gentle.recovery!.records.push(event(inj, addDays(MON, -10), { event: 'cleared', status: 'cleared' }));
    expect(loadSpikes(MON, gentle)[0]?.text).toMatch(/recently cleared/);
  });

  it('flags a big week-to-week jump in sets per muscle', () => {
    const data = moduleData();
    const lastMon = addDays(startOfWeek(MON), -7);
    setDay(data, addDays(lastMon, -7), { sessionDone: true });
    for (let i = 0; i < 6; i++) setDay(data, addDays(lastMon, i), { sessionDone: true });
    expect(loadSpikes(MON, data).length).toBeGreaterThan(0);
  });

  it('reports to the Goal Guardian as an action', () => {
    const data = moduleData();
    weight(data, addDays(MON, -20), 'Barbell Bench Press', 100, 'clean');
    weight(data, addDays(MON, -3), 'Barbell Bench Press', 115, 'clean');
    expect(guardian(MON, data).prevention.some((p) => p.startsWith('Load jump: Bench'))).toBe(true);
  });
});

describe('prevention: injury patterns', () => {
  it('shows recurring regions and the week before each injury, without conclusions', () => {
    const a = injury({ region: 'hamstring', side: 'left', start: '2027-03-01' });
    const b = injury({ region: 'hamstring', side: 'right', start: '2027-05-01' });
    const data = moduleData({ injuries: [a, b] });
    for (let i = 1; i <= 7; i++) checkin(data, addDays(b.start, -i), { sleepMin: 360, stress: 4 });
    const p = patterns(data);
    expect(p.recurring).toEqual([{ region: 'hamstring', label: 'Hamstring', count: 2 }]);
    const text = beforeText(p.before[0]);
    expect(text).toMatch(/sleep 6 h 00, stress 4\.0\/5/);
    expect(text).not.toMatch(/caus/i);
  });
});

describe('prevention: the body map', () => {
  it('draws with ellipses and rectangles only, and every spot is a labelled button', () => {
    const html = renderToStaticMarkup(createElement(BodyMap, { data: moduleData(), date: MON }));
    expect(html).not.toMatch(/<path/);
    expect(html).toMatch(/<ellipse/);
    expect(html).toMatch(/aria-label="Right quad"/);
    expect(html).toMatch(/aria-label="Left hamstring"/);
  });
});
