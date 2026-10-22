// Writes for the recovery module. Typed so the module can only ever write its own tables.
import { db } from '../db/db';
import { newId, put, remove } from '../db/store';
import type { Injury, InjuryCheckin, RecordKind, RecordOf, RecoveryRecord, SettingsRecord, WellnessCheckin } from './model';
import { SETTINGS_ID } from './model';

export type RecoveryTable = 'injuries' | 'injuryCheckins' | 'wellnessCheckins' | 'recoveryRecords';

type Draft<T> = Omit<T, 'updatedAt' | 'id'> & { id?: string; updatedAt?: number };

export async function saveSettings(patch: Partial<Omit<SettingsRecord, 'id' | 'kind' | 'updatedAt'>>): Promise<void> {
  const prev = await db.recoveryRecords.get(SETTINGS_ID);
  const base: SettingsRecord = prev && prev.kind === 'settings' ? prev : { id: SETTINGS_ID, kind: 'settings', enabled: false, updatedAt: 0 };
  await put('recoveryRecords', { ...base, ...patch, id: SETTINGS_ID, kind: 'settings', deleted: false });
}

export const setModuleEnabled = (enabled: boolean) => saveSettings({ enabled });

export async function saveInjury(row: Draft<Injury>): Promise<Injury> {
  return put('injuries', { ...row, id: row.id ?? newId(), deleted: false }) as Promise<Injury>;
}

export const deleteInjury = (id: string) => remove('injuries', id);

export async function saveInjuryCheckin(row: Omit<InjuryCheckin, 'updatedAt' | 'id'>): Promise<void> {
  await put('injuryCheckins', { ...row, id: `ic:${row.injuryId}:${row.date}`, deleted: false });
}

export async function saveWellness(row: Omit<WellnessCheckin, 'updatedAt' | 'id'>): Promise<void> {
  await put('wellnessCheckins', { ...row, id: `wc:${row.date}`, deleted: false });
}

/** Add or update a record of any kind. Append-only kinds (events) get a fresh id. */
export async function saveRecord<K extends RecordKind>(row: Draft<RecordOf<K>>): Promise<RecordOf<K>> {
  return put('recoveryRecords', { ...(row as object), id: row.id ?? newId(), deleted: false } as RecoveryRecord) as Promise<RecordOf<K>>;
}

export const deleteRecord = (id: string) => remove('recoveryRecords', id);

// ---------------------------------------------------------------- local-only photos (never backed up)

export async function saveLocalPhoto(date: string, view: 'front' | 'side' | 'back' | 'other', dataUrl: string): Promise<void> {
  await db.localPhotos.put({ id: newId(), date, view, dataUrl, bytes: Math.round((dataUrl.length * 3) / 4), updatedAt: Date.now() });
}

export async function deleteLocalPhoto(id: string): Promise<void> {
  await db.localPhotos.delete(id);
}
