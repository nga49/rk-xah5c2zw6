// Kilos and pounds: everything is stored in kg; pounds change what is shown, typed and the plate steps.
import { describe, expect, it } from 'vitest';
import { accessoryProgress } from '../src/engine/loads';
import { getPosition } from '../src/engine/position';
import { buildSession, modsForType } from '../src/engine/session';
import { computeDay } from '../src/engine/today';
import { LB_PER_KG, unitsOf } from '../src/engine/units';
import { makeData, weight } from './helpers';

const lbData = () => {
  const data = makeData();
  data.profile = { ...data.profile!, units: 'lb' };
  return data;
};

describe('units', () => {
  it('kg mode is unchanged', () => {
    const u = unitsOf({ units: 'kg' });
    expect(u.roundDown(139.06, 'barbell')).toBe(137.5);
    expect(u.w(137.5)).toBe('137.5 kg');
    expect(u.step('dumbbell')).toBe(2);
  });

  it('converts both ways without drift', () => {
    const u = unitsOf({ units: 'lb' });
    for (const v of [5, 45, 135, 225, 315, 297.5]) expect(u.show(u.fromDisplay(v))).toBe(v);
    expect(u.w(100)).toBe('220.5 lb');
    expect(u.around(50)).toBe('110 lb');
    expect(u.rate(-0.5)).toBe('-1.1 lb/week');
  });

  it('pounds round to US plate steps: 5 lb on the bar, 2.5 lb on a dip belt', () => {
    const u = unitsOf({ units: 'lb' });
    expect(u.show(u.roundDown(136, 'barbell'))).toBe(295); // 299.8 lb -> 295
    expect(u.show(u.roundDown(20, 'weighted'))).toBe(42.5); // 44.1 lb -> 42.5
    expect(u.step('dumbbell')).toBe(5);
    expect(unitsOf({ units: 'lb', dumbbellStepLb: 2.5 }).step('dumbbell')).toBe(2.5);
  });

  it('bench suggestion in pounds: 85% then 90% and 75%, each rounded to 5 lb', () => {
    const data = lbData();
    const date = '2026-11-02'; // M1 week 3
    const pos = getPosition(date, data.plan);
    const kg = (type: 'Full' | 'Moderate' | 'Light') => buildSession({ date, code: 'BLADES', pos, mods: modsForType(type), data }).exercises.find((e) => e.lift === 'bench')?.load?.kg as number;
    const u = unitsOf(data.profile);
    expect(u.show(kg('Full'))).toBe(295); // 160 kg x 0.85 = 136 kg = 299.8 lb
    expect(u.show(kg('Moderate'))).toBe(265); // 295 x 0.9 = 265.5
    expect(u.show(kg('Light'))).toBe(220); // 295 x 0.75 = 221.25
  });

  it('accessory progression in pounds: 25 lb clean twice goes to 30 lb; two hard drops a full step', () => {
    const data = lbData();
    const u = unitsOf(data.profile);
    const name = 'Dumbbell Lateral Raise';
    weight(data, '2026-10-23', name, u.fromDisplay(25), 'clean');
    weight(data, '2026-10-30', name, u.fromDisplay(25), 'clean');
    const up = accessoryProgress(name, data.weights, '2026-11-06', u);
    expect(u.show(up.kg as number)).toBe(30);
    weight(data, '2026-11-06', name, up.kg as number, 'hard');
    weight(data, '2026-11-13', name, up.kg as number, 'hard');
    expect(u.show(accessoryProgress(name, data.weights, '2026-11-20', u).kg as number)).toBe(25);
  });

  it('wording follows the unit, while stored values stay in kg', () => {
    const data = lbData();
    const v = computeDay('2026-11-02', data, new Date('2026-11-02T08:00:00'));
    const bench = v.session.exercises.find((e) => e.lift === 'bench');
    expect(bench?.load?.why[0]).toMatch(/of e1RM 352\.7 lb/); // 160 kg
    expect(bench?.load?.kg).toBeCloseTo(295 / LB_PER_KG, 6);
  });
});
