// One-tap answers to an open red flag: "I have been seen" (an assessment clears it, the area can move on)
// or "Ticked by mistake" (the tick is removed from the log entry and from the latest check-in).
import type { Data } from '../engine/model';
import type { ISODate } from '../plan/types';
import { saveInjury, saveInjuryCheckin, saveRecord } from './actions';
import type { Injury } from './model';

export async function markSeen(inj: Injury, date: ISODate): Promise<void> {
  await saveRecord<'injuryEvent'>({ kind: 'injuryEvent', injuryId: inj.id, date, event: 'assessed', by: 'owner', note: 'Seen by a clinician' });
}

export async function untickFlags(inj: Injury, date: ISODate, data: Data): Promise<void> {
  if (inj.atLog?.flags?.length) await saveInjury({ ...inj, atLog: { ...inj.atLog, flags: undefined } });
  const latest = (data.recovery?.checkins ?? []).filter((c) => c.injuryId === inj.id && c.date <= date && c.flags?.length).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  if (latest) {
    const { id: _id, updatedAt: _u, deleted: _d, ...rest } = latest;
    await saveInjuryCheckin({ ...rest, flags: undefined });
  }
}
