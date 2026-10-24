// Logging for a past day: the gaps are found, filling them counts, and a past session can be ticked afterwards.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { RagnarokDB, useDatabase } from '../src/db/db';
import { loadData, saveProfile } from '../src/db/store';
import { pastDay, stepsMissing } from '../src/engine/backfill';
import { addDays } from '../src/engine/dates';
import { completion } from '../src/engine/tasks';
import { computeDay } from '../src/engine/today';
import { PLAN_START } from '../src/plan';
import { markSessionDone, reopenSession, setSteps } from '../src/state/actions';
import { makeData, profile, setDay } from './helpers';

const T = addDays(PLAN_START, 30);
const noon = (d: string) => new Date(`${d}T12:00:00`);

describe('steps not logged', () => {
  it('lists the recent days with no steps, never today and never before the app was first used', () => {
    const data = makeData();
    setDay(data, addDays(T, -5), { steps: 9000 });
    setDay(data, addDays(T, -3), { mobilityMin: 10 });
    setDay(data, addDays(T, -1), { steps: 0 });
    setDay(data, T, {});
    expect(stepsMissing(T, data)).toEqual([addDays(T, -4), addDays(T, -3), addDays(T, -2)]);
  });

  it('is empty before any day was used', () => {
    expect(stepsMissing(T, makeData())).toEqual([]);
  });

  it('adding the steps afterwards marks that day\'s steps task done and raises its completion', () => {
    const data = makeData();
    const d = addDays(T, -2);
    setDay(data, d, { mobilityMin: 10 });
    const before = computeDay(d, data, noon(d));
    expect(before.tasks.training.find((t) => t.id === 'steps')?.done).toBe(false);
    setDay(data, d, { steps: 12000 });
    const after = computeDay(d, data, noon(d));
    expect(after.tasks.training.find((t) => t.id === 'steps')?.done).toBe(true);
    expect(completion([...after.tasks.training, ...after.tasks.mind])).toBeGreaterThan(completion([...before.tasks.training, ...before.tasks.mind]));
    expect(stepsMissing(T, data)).toEqual([addDays(T, -1)]);
  });
});

describe('past day route', () => {
  it('accepts only a real date before today', () => {
    expect(pastDay('2026-11-02', '2026-11-05')).toBe('2026-11-02');
    expect(pastDay('2026-11-05', '2026-11-05')).toBeNull();
    expect(pastDay('2026-11-09', '2026-11-05')).toBeNull();
    expect(pastDay('backup', '2026-11-05')).toBeNull();
    expect(pastDay(undefined, '2026-11-05')).toBeNull();
  });
});

describe('a past session ticked afterwards', () => {
  it('is marked done without inventing weights, and can be unticked', async () => {
    const d = new RagnarokDB(`backfill-${Math.random()}`);
    useDatabase(d);
    await saveProfile(profile());
    let day = T;
    while (!computeDay(day, await loadData(), noon(day)).session.code) day = addDays(day, -1);
    const code = computeDay(day, await loadData(), noon(day)).session.code!;
    await markSessionDone(day, code);
    let data = await loadData();
    expect(data.days.get(day)).toMatchObject({ sessionDone: true, sessionCode: code });
    expect(computeDay(day, data, noon(day)).tasks.training.find((t) => t.id === 'session')?.done).toBe(true);
    expect(data.weights.filter((w) => w.date === day)).toEqual([]);
    await reopenSession(day);
    await setSteps(day, 8000);
    data = await loadData();
    expect(data.days.get(day)?.sessionDone).toBe(false);
    expect(data.days.get(day)?.steps).toBe(8000);
    d.close();
  });
});
