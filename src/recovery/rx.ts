// Physio prescriptions: exercises, sets, reps, frequency and restrictions typed from a physio's plan.
// They replace the app's generic rehab for that area; their blocked movements always win (constraints).
import { weekday } from '../engine/dates';
import type { Data } from '../engine/model';
import type { PlannedExercise } from '../engine/session';
import type { ISODate } from '../plan/types';
import type { RecordOf, RxItem } from './model';

export const rxId = (injuryId: string) => `rx:${injuryId}`;

/** The prescription in force for an injury on a date (the latest one dated on or before it, not expired). */
export function rxFor(injuryId: string, date: ISODate, data: Data): RecordOf<'rx'> | null {
  const rows = (data.recovery?.records ?? []).filter((r): r is RecordOf<'rx'> => r.kind === 'rx' && r.injuryId === injuryId && r.date <= date && (!r.until || r.until >= date));
  return rows.sort((a, b) => (a.date === b.date ? a.updatedAt - b.updatedAt : a.date < b.date ? -1 : 1)).at(-1) ?? null;
}

/** Items due on a date: those for that weekday, or every day when no days are set. */
export const rxDue = (rx: RecordOf<'rx'>, date: ISODate): RxItem[] => rx.items.filter((it) => !it.days?.length || it.days.includes(weekday(date)));

export const rxDose = (it: RxItem) => (it.holdS ? `${it.holdS} s hold` : it.reps ?? '');

export function rxRows(rx: RecordOf<'rx'>, date: ISODate, label: string): PlannedExercise[] {
  return rxDue(rx, date).map((it, i) => ({
    key: `RX:${rx.injuryId}:${i}`,
    name: it.name,
    originalName: it.name,
    sets: it.sets,
    reps: rxDose(it) || null,
    repsTop: null,
    rest_s: 45,
    muscles: [],
    perSide: it.perSide,
    role: 'accessory' as const,
    equipment: 'none' as const,
    rir: '3',
    load: null,
    note: it.note,
    changes: [`Physio prescription: ${label}`],
    conditional: 'As your physio prescribed',
  }));
}
