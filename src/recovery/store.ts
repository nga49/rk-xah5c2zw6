// Read path for the recovery module. Imports only the database handle, so loadData can call it.
import { db } from '../db/db';
import type { Injury, InjuryCheckin, RecoveryData, RecoveryRecord, SettingsRecord, WellnessCheckin } from './model';
import { REGIONS, SETTINGS_ID, SIDES } from './model';

const clamp10 = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : undefined);

export async function readSettings(): Promise<SettingsRecord | undefined> {
  const s = await db.recoveryRecords.get(SETTINGS_ID);
  return s && !s.deleted && s.kind === 'settings' ? s : undefined;
}

/**
 * Module data for the engine, or undefined while the module is off. When off, only the one
 * settings row is read, so the original app reads exactly what it always read.
 * Normalisation happens in memory only and is never written back.
 */
export async function loadRecovery(): Promise<RecoveryData | undefined> {
  const settings = await readSettings();
  if (!settings || settings.enabled !== true) return undefined;
  const [injuryRows, checkinRows, wellnessRows, recordRows] = await Promise.all([
    db.injuries.toArray(),
    db.injuryCheckins.toArray(),
    db.wellnessCheckins.toArray(),
    db.recoveryRecords.toArray(),
  ]);
  const issues: string[] = [];
  const injuries: Injury[] = [];
  for (const i of injuryRows) {
    if (i.deleted) continue;
    if (!REGIONS.includes(i.region) || !SIDES.includes(i.side) || typeof i.start !== 'string') {
      issues.push(`An injury entry is missing its region, side or start date (${i.id.slice(0, 8)}). Edit it to protect that area.`);
      continue;
    }
    injuries.push({ ...i, atLog: i.atLog ? { ...i.atLog, painRest: clamp10(i.atLog.painRest), painWalk: clamp10(i.atLog.painWalk), painLoad: clamp10(i.atLog.painLoad) } : undefined });
  }
  const checkins: InjuryCheckin[] = checkinRows
    .filter((c) => !c.deleted && typeof c.date === 'string' && typeof c.injuryId === 'string')
    .map((c) => ({ ...c, painRest: clamp10(c.painRest), painWalk: clamp10(c.painWalk), painSession: clamp10(c.painSession), painMorning: clamp10(c.painMorning), stiffMorning: clamp10(c.stiffMorning) }));
  const wellness: WellnessCheckin[] = wellnessRows.filter((w) => !w.deleted && typeof w.date === 'string').map((w) => ({ ...w, soreness: clamp10(w.soreness) }));
  const records: RecoveryRecord[] = recordRows.filter((r) => !r.deleted && typeof (r as { kind?: unknown }).kind === 'string');
  return { settings, injuries, checkins, wellness, records, issues };
}
