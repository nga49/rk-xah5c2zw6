import type { ISODate } from '../plan/types';
import type { Data, DayRecord, Profile } from '../engine/model';
import { emptyData } from '../engine/model';
import { DATA_TABLES, db, type DataTable, type Rows } from './db';
import { emptySnapshot, mergeSnapshots, type BackupFile, type Snapshot } from './merge';
import { loadRecovery } from '../recovery/store';

// ---------------------------------------------------------------- change notifications

type Listener = () => void;
const listeners = new Set<Listener>();
/** The backup scheduler listens here: every write restarts its 2-minute timer. */
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let clock = () => Date.now();
/** Tests pin the clock. */
export function setClock(fn: () => number): void {
  clock = fn;
}
export const now = () => clock();

async function touched(): Promise<void> {
  await setDevice('pendingAt', now());
  listeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------- device settings (never backed up)

export interface DeviceSettings {
  ghUser?: string;
  ghRepo?: string;
  ghToken?: string;
  lastBackupAt?: number;
  lastBackupError?: string;
  lastMonthly?: string;
  pendingAt?: number;
  unlockedAt?: number;
}

export async function getDevice<K extends keyof DeviceSettings>(key: K): Promise<DeviceSettings[K] | undefined> {
  return (await db.device.get(key))?.value as DeviceSettings[K] | undefined;
}

export async function setDevice<K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K] | undefined): Promise<void> {
  if (value === undefined) await db.device.delete(key);
  else await db.device.put({ key, value });
}

export async function allDevice(): Promise<DeviceSettings> {
  const rows = await db.device.toArray();
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as DeviceSettings;
}

// ---------------------------------------------------------------- writes

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Omit that works on each member of a union (plan events). */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export async function put<K extends DataTable>(table: K, row: DistOmit<Rows[K], 'updatedAt'> & { updatedAt?: number }): Promise<Rows[K]> {
  const rec = { ...row, updatedAt: now() } as unknown as Rows[K];
  await db.table_(table).put(rec);
  await touched();
  return rec;
}

/** Soft delete, so a restore or a merge never brings the record back. */
export async function remove<K extends DataTable>(table: K, id: string): Promise<void> {
  const prev = await db.table_(table).get(id);
  if (!prev) return;
  await db.table_(table).put({ ...prev, deleted: true, updatedAt: now() });
  await touched();
}

export async function patchDay(date: ISODate, patch: Partial<DayRecord> | ((d: DayRecord) => Partial<DayRecord>)): Promise<DayRecord> {
  const prev = (await db.days.get(date)) ?? { id: date, updatedAt: 0 };
  const changes = typeof patch === 'function' ? patch(prev) : patch;
  return put('days', { ...prev, ...changes, id: date, deleted: false });
}

export async function setTask(date: ISODate, id: string, done: boolean): Promise<void> {
  await patchDay(date, (d) => ({ tasks: { ...(d.tasks ?? {}), [id]: done } }));
}

export async function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  const prev = await db.profile.get('me');
  return put('profile', { ...(prev as Profile), ...patch, id: 'me' });
}

// ---------------------------------------------------------------- reads

export async function loadData(): Promise<Data> {
  const data = emptyData();
  const [profile, days, cardio, maxes, body, standards, weights, reviews, seasonScores, kcalAdjust, plan, dismissed] = await Promise.all([
    db.profile.get('me'),
    db.days.toArray(),
    db.cardio.toArray(),
    db.maxes.toArray(),
    db.body.toArray(),
    db.standards.toArray(),
    db.weights.toArray(),
    db.reviews.toArray(),
    db.seasonScores.toArray(),
    db.kcalAdjust.toArray(),
    db.plan.toArray(),
    db.dismissed.toArray(),
  ]);
  data.profile = profile && !profile.deleted ? profile : null;
  for (const d of days) if (!d.deleted) data.days.set(d.id, d);
  data.cardio = cardio.filter((r) => !r.deleted);
  data.maxes = maxes.filter((r) => !r.deleted);
  data.body = body.filter((r) => !r.deleted);
  data.standards = standards.filter((r) => !r.deleted);
  data.weights = weights.filter((r) => !r.deleted);
  data.reviews = reviews.filter((r) => !r.deleted);
  data.seasonScores = seasonScores.filter((r) => !r.deleted);
  data.kcalAdjust = kcalAdjust.filter((r) => !r.deleted);
  data.plan = plan.filter((r) => !r.deleted);
  data.dismissed = new Set(dismissed.filter((r) => !r.deleted).map((r) => r.id));
  const recovery = await loadRecovery();
  if (recovery) data.recovery = recovery;
  return data;
}

// ---------------------------------------------------------------- export, import, merge

/** Photos above this size stay on the phone only. */
export const PHOTO_BACKUP_LIMIT = 150_000;

export async function snapshot(): Promise<Snapshot> {
  const out = emptySnapshot();
  for (const t of DATA_TABLES) (out as Record<string, unknown[]>)[t] = await db.table(t).toArray();
  return out;
}

export async function exportFile(exportedAt = new Date(now()).toISOString()): Promise<BackupFile> {
  const s = await snapshot();
  const kept = s.photos.filter((p) => p.bytes > PHOTO_BACKUP_LIMIT).map((p) => p.id);
  const tables: Snapshot = { ...s, photos: s.photos.filter((p) => p.bytes <= PHOTO_BACKUP_LIMIT) };
  return { app: 'ragnarok', version: 1, exportedAt, photosKeptLocal: kept.length ? kept : undefined, tables };
}

/** Merge a backup into this device: per record, the newer `updatedAt` wins. Returns how many records changed. */
export async function mergeFile(file: BackupFile): Promise<number> {
  const local = await snapshot();
  const { toWrite, changed, localNewer } = mergeSnapshots(local, file.tables);
  // This device holds something the file does not: back it up again.
  if (localNewer) await setDevice('pendingAt', now());
  if (!changed) return 0;
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) {
      const rows = toWrite[t] as unknown[];
      if (rows.length) await db.table(t).bulkPut(rows);
    }
  });
  listeners.forEach((fn) => fn());
  return changed;
}
