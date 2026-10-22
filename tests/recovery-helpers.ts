// Synthetic recovery-module fixtures. Generic regions and made-up values only: never a real case.
import type { Data } from '../src/engine/model';
import type { Injury, InjuryCheckin, RecoveryData, RecoveryRecord, WellnessCheckin } from '../src/recovery/model';
import { makeData } from './helpers';

export function recovery(over: Partial<RecoveryData> = {}): RecoveryData {
  return { settings: { id: 'settings', kind: 'settings', enabled: true, updatedAt: 1 }, injuries: [], checkins: [], wellness: [], records: [], issues: [], ...over };
}

let n = 0;
export function injury(over: Partial<Injury> & Pick<Injury, 'region' | 'side' | 'start'>): Injury {
  return { id: `inj-${++n}`, updatedAt: 1, ...over };
}

export function injCheckin(i: Injury, date: string, over: Partial<InjuryCheckin> = {}): InjuryCheckin {
  return { id: `ic:${i.id}:${date}`, injuryId: i.id, date, updatedAt: Date.parse(date), ...over };
}

export function wellness(date: string, over: Partial<WellnessCheckin> = {}): WellnessCheckin {
  return { id: `wc:${date}`, date, updatedAt: Date.parse(date), ...over };
}

export function event(i: Injury, date: string, over: Partial<Extract<RecoveryRecord, { kind: 'injuryEvent' }>>): RecoveryRecord {
  return { id: `ev-${++n}`, kind: 'injuryEvent', injuryId: i.id, date, event: 'phase', by: 'owner', updatedAt: Date.parse(date) + n, ...over } as RecoveryRecord;
}

/** Neutral plan data with the module on and the given module rows. */
export function moduleData(r: Partial<RecoveryData> = {}, base: Data = makeData()): Data {
  return { ...base, recovery: recovery(r) };
}
