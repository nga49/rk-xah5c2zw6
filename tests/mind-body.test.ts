// Phase 9: what a layoff keeps, the mindset check, protein and the calories mode. Synthetic values only.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { RagnarokDB, useDatabase } from '../src/db/db';
import { snapshot } from '../src/db/store';
import { computeDay } from '../src/engine/today';
import type { Data } from '../src/engine/model';
import { saveLocalPhoto } from '../src/recovery/actions';
import { currentMode, moduleOffset, offsetFor, planMode, plannedGap, proteinTarget } from '../src/recovery/fuel';
import { reassurance } from '../src/recovery/mind';
import type { RecoveryRecord } from '../src/recovery/model';
import { morning } from './fixtures';
import { makeData } from './helpers';
import { event, injury, moduleData } from './recovery-helpers';

const D = '2026-11-04';
const day = (data: Data, d: string) => computeDay(d, data, morning(d));

function injured(extra: RecoveryRecord[] = [], base?: Data) {
  const inj = injury({ region: 'hamstring', side: 'right', start: '2026-10-28' });
  return { inj, data: moduleData({ injuries: [inj], records: [event(inj, '2026-10-28', { event: 'phase', phase: 'protect' }), ...extra] }, base) };
}

describe('mind and body: what a layoff keeps', () => {
  it('compares girths with before the injury and reports the weight trend, plainly', () => {
    const m = (id: string, date: string, armCm: number, neckCm: number): RecoveryRecord => ({ id, kind: 'measure', date, armCm, neckCm, updatedAt: 1 });
    const base = makeData();
    for (const d of ['2026-10-24', '2026-10-25', '2026-10-26', '2026-11-02', '2026-11-03', '2026-11-04']) base.body.push({ id: `b${d}`, date: d, weightKg: 86, updatedAt: 1 });
    const { data } = injured([m('m1', '2026-10-20', 40, 42), m('m2', '2026-11-03', 40, 42.5)], base);
    const lines = reassurance(D, data);
    expect(lines[0]).toMatch(/Neck 42\.5 cm \(\+0\.5\), Arm 40 cm \(same\)/);
    expect(lines.some((l) => /Weight 86(\.0)? kg, holding since the injury/.test(l))).toBe(true);
  });

  it('progress photos stay on the phone: never in the backup snapshot', async () => {
    const d = new RagnarokDB(`mb-${Math.random()}`);
    useDatabase(d);
    await saveLocalPhoto(D, 'front', 'data:image/jpeg;base64,AAAA');
    const snap = await snapshot();
    expect(Object.keys(snap)).not.toContain('localPhotos');
    expect(JSON.stringify(snap)).not.toContain('AAAA');
    d.close();
  });
});

describe('mind and body: the mindset check', () => {
  it('high frustration during an injury warns against returning early; without an injury it says nothing', () => {
    const ms: RecoveryRecord = { id: `ms:${D}`, kind: 'mindset', date: D, frustration: 5, motivation: 3, confidence: 3, updatedAt: 1 };
    const { data } = injured([ms]);
    expect(day(data, D).insights.some((i) => i.id === `rec:mind:${D}` && /early/.test(i.title))).toBe(true);
    expect(day(moduleData({ records: [ms] }), D).insights.some((i) => i.id.startsWith('rec:mind:'))).toBe(false);
  });
});

describe('mind and body: recovery nutrition', () => {
  it('protein: 2.0 g per kg while injured, never below the plan target', () => {
    const base = makeData();
    base.body.push({ id: 'b1', date: D, weightKg: 100, updatedAt: 1 });
    expect(proteinTarget(D, injured([], base).data).grams).toBe(200);
    const light = makeData();
    light.body.push({ id: 'b1', date: D, weightKg: 80, updatedAt: 1 });
    const t = proteinTarget(D, injured([], light).data);
    expect(t.grams).toBe(t.plan);
    expect(proteinTarget(D, moduleData({}, base)).grams).toBe(t.plan);
  });

  it('the calories mode is the plan until the owner changes it, and changes add up through calorie rows', () => {
    const data = moduleData();
    expect(planMode(D, data)).toBe('cut');
    expect(offsetFor('maintenance', D, data)).toBe(plannedGap(D, data));
    expect(offsetFor('cut', D, data)).toBe(0);
    data.kcalAdjust.push({ id: 'k1', block: 'M1', offsetKcal: plannedGap(D, data), date: D, reason: 'x', sourceId: `rec:mode:${D}:maintenance`, updatedAt: 1 });
    expect(moduleOffset(D, data)).toBe(plannedGap(D, data));
    expect(currentMode(D, data)).toBe('maintenance');
    // Back to the plan needs exactly the opposite row.
    expect(offsetFor('cut', D, data) - moduleOffset(D, data)).toBe(-plannedGap(D, data));
  });

  it('the maintenance suggestion disappears once maintenance is chosen', () => {
    const { data, inj } = injured();
    expect(day(data, D).insights.some((i) => i.id === `rec:maint:${inj.id}`)).toBe(true);
    const chosen = injured([{ id: 'n1', kind: 'nutrition', date: '2026-10-29', mode: 'maintenance', reason: 'owner choice', updatedAt: 1 }]);
    expect(day(chosen.data, D).insights.some((i) => i.id.startsWith('rec:maint:'))).toBe(false);
  });
});
