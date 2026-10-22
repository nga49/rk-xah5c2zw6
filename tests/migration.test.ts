// The database as it shipped before the recovery module, frozen here as a literal, so any later
// schema change can be proven additive: every original table, row, key and index must survive.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { DATA_TABLES, RagnarokDB, useDatabase } from '../src/db/db';
import { loadData, snapshot } from '../src/db/store';

/** Version 1 exactly as in src/db/db.ts at main 0b9b9fe. Never edit. */
export const V1_STORES = {
  profile: 'id',
  days: 'id',
  cardio: 'id, date',
  maxes: 'id, date, lift',
  body: 'id, date',
  standards: 'id, date',
  weights: 'id, date, exercise',
  reviews: 'id',
  seasonScores: 'id',
  kcalAdjust: 'id',
  plan: 'id',
  dismissed: 'id',
  photos: 'id, date',
  device: 'key',
} as const;

export const V1_TABLES = Object.keys(V1_STORES);

/** A plain Dexie handle with only the version 1 stores (typed loosely: Dexie's schema generics are too deep here). */
function openV1(name: string): Dexie {
  const v1 = new Dexie(name);
  const version = v1.version(1) as unknown as { stores(s: Record<string, string>): unknown };
  version.stores({ ...V1_STORES });
  return v1;
}

/** Synthetic rows in every original table, including soft-deleted rows. */
export function v1Seed(): Record<string, Record<string, unknown>[]> {
  return {
    profile: [{ id: 'me', name: 'Test', goal: 'g', injuries: '', rules: '', startDate: '2026-10-19', units: 'kg', dumbbellStep: 2, safetyBar: false, beltSquat: false, updatedAt: 5 }],
    days: [
      { id: '2026-10-20', updatedAt: 6, checkin: { sleepMin: 450, sleepScore: 80, energy: 4, stress: 2, backPain: 0, kneePain: 0 }, readiness: { score: 90, type: 'Full', reasons: ['x'], overridden: false }, sessionDone: true, sessionCode: 'LEVIATHAN', session: { 'LEVIATHAN:0': 4 } },
      { id: '2026-10-21', updatedAt: 7, deleted: true },
    ],
    cardio: [{ id: 'c1', date: '2026-10-20', type: 'walk', minutes: 30, feel: 'easy', updatedAt: 8 }],
    maxes: [{ id: 'm1', date: '2026-10-18', lift: 'bench', weightKg: 100, reps: 1, e1rm: 100, source: 'benchmark', updatedAt: 9 }],
    body: [{ id: 'b1', date: '2026-10-20', weightKg: 80, updatedAt: 10 }],
    standards: [{ id: 's1', date: '2026-10-20', standard: 'farmer', value: 30, updatedAt: 11 }],
    weights: [{ id: 'w1', date: '2026-10-20', exercise: 'Barbell Bench Press', kg: 80, mark: 'clean', updatedAt: 12 }, { id: 'w2', date: '2026-10-20', exercise: 'Lat Pull-down', kg: 50, updatedAt: 13, deleted: true }],
    reviews: [{ id: '2026-10-19', answers: ['a', 'b', 'c'], stats: { sessions: 3 }, updatedAt: 14 }],
    seasonScores: [{ id: '1:1', seasonIndex: 1, habitSeason: 1, habit: 'h', score: 7, updatedAt: 15 }],
    kcalAdjust: [{ id: 'k1', block: '1.1', offsetKcal: -100, date: '2026-10-20', reason: 'r', updatedAt: 16 }],
    plan: [{ id: 'p1', kind: 'pause', date: '2026-11-01', days: 2, updatedAt: 17 }],
    dismissed: [{ id: 'x:1', date: '2026-10-20', updatedAt: 18 }],
    photos: [{ id: 'ph1', date: '2026-10-20', view: 'front', dataUrl: 'data:image/jpeg;base64,AAAA', bytes: 3, updatedAt: 19 }],
    device: [{ key: 'ghUser', value: 'someone' }, { key: 'lastBackupAt', value: 123 }],
  };
}

async function seededV1(name: string) {
  const v1 = openV1(name);
  const seed = v1Seed();
  for (const [t, rows] of Object.entries(seed)) await v1.table(t).bulkPut(rows);
  v1.close();
  return seed;
}

describe('database schema: additive only', () => {
  it('every backed-up table exists in the schema, and every schema table except device is backed up', () => {
    const d = new RagnarokDB(`schema-${Math.random()}`);
    const tables = d.tables.map((t) => t.name).sort();
    expect([...DATA_TABLES].sort()).toEqual(tables.filter((t) => t !== 'device' && !LOCAL_ONLY.includes(t)).sort());
    d.close();
  });

  it('opening a version 1 database with the current code keeps every original row, key and index', async () => {
    const name = `mig-${Math.random()}`;
    const seed = await seededV1(name);
    const d = new RagnarokDB(name);
    await d.open();
    for (const t of V1_TABLES) {
      const rows = await d.table(t).toArray();
      const key = t === 'device' ? 'key' : 'id';
      const sort = (xs: Record<string, unknown>[]) => [...xs].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      expect(sort(rows)).toEqual(sort(seed[t]));
      const schema = d.table(t).schema;
      const want = V1_STORES[t as keyof typeof V1_STORES].split(',').map((s) => s.trim());
      expect(schema.primKey.name).toBe(want[0]);
      expect(schema.indexes.map((i) => i.name).sort()).toEqual(want.slice(1).sort());
    }
    useDatabase(d);
    const data = await loadData();
    expect(data.profile?.name).toBe('Test');
    expect(data.days.has('2026-10-20')).toBe(true);
    expect(data.days.has('2026-10-21')).toBe(false);
    expect(data.weights.map((w) => w.id)).toEqual(['w1']);
    const snap = await snapshot();
    for (const t of V1_TABLES.filter((x) => x !== 'device')) expect((snap as Record<string, unknown[]>)[t].length).toBe(seed[t].length);
    d.close();
  });
});

/** Stores that are deliberately never backed up (besides device). Empty before the module. */
export const LOCAL_ONLY: string[] = [];
