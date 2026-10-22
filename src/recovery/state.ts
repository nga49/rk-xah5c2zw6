// Injury state on a date, derived from records. Status and phase come from the append-only event
// log, never from a mutable field, so a merge can never erase history.
import type { Data } from '../engine/model';
import { diffDays } from '../engine/dates';
import type { ISODate } from '../plan/types';
import type { Injury, InjuryCheckin, InjuryStatus, Phase, RecordOf, RedFlag } from './model';
import { REGION_LABEL } from './model';

export type InjuryEvent = RecordOf<'injuryEvent'>;

export interface ActiveInjury {
  injury: Injury;
  status: InjuryStatus;
  /** Phase the owner (or a clinician) set or confirmed, before today's symptom check. */
  phase: Phase;
  /** Days since the start date (the start date is day 0). */
  day: number;
  checkins: InjuryCheckin[];
  events: InjuryEvent[];
  /** Red flags from the log entry and recent check-ins that no later assessment cleared. */
  flags: RedFlag[];
  /** A clinician's phase ceiling, if one was recorded. */
  phaseCap?: Phase;
  clearedLoading: boolean;
}

const byTime = <T extends { date: string; updatedAt: number }>(a: T, b: T) => (a.date === b.date ? a.updatedAt - b.updatedAt : a.date < b.date ? -1 : 1);

export function eventsFor(injuryId: string, data: Data, until?: ISODate): InjuryEvent[] {
  return (data.recovery?.records ?? [])
    .filter((r): r is InjuryEvent => r.kind === 'injuryEvent' && r.injuryId === injuryId && (!until || r.date <= until))
    .sort(byTime);
}

export function checkinsFor(injuryId: string, data: Data, until?: ISODate): InjuryCheckin[] {
  return (data.recovery?.checkins ?? []).filter((c) => c.injuryId === injuryId && (!until || c.date <= until)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function statusOn(inj: Injury, date: ISODate, data: Data): InjuryStatus {
  const last = eventsFor(inj.id, data, date).filter((e) => e.status).at(-1);
  return last?.status ?? inj.status ?? 'acute';
}

export function phaseOn(inj: Injury, date: ISODate, data: Data): Phase {
  const last = eventsFor(inj.id, data, date).filter((e) => e.phase).at(-1);
  return last?.phase ?? 'protect';
}

/** Open red flags: from the log entry and check-ins, until an assessment dated on or after them. */
export function openFlags(inj: Injury, date: ISODate, data: Data): RedFlag[] {
  const assessed = eventsFor(inj.id, data, date).filter((e) => e.event === 'assessed' || e.event === 'cleared').at(-1)?.date;
  const out = new Set<RedFlag>();
  if (!assessed || inj.start > assessed) for (const f of inj.atLog?.flags ?? []) out.add(f);
  const recent = checkinsFor(inj.id, data, date).filter((c) => !assessed || c.date > assessed);
  const latest = recent.at(-1);
  // Only the latest check-in's ticks count, so a flag ticked by mistake can be unticked.
  for (const f of latest?.flags ?? []) out.add(f);
  return [...out];
}

export function isEpisodeActive(inj: Injury, date: ISODate, data: Data): boolean {
  if (inj.kind === 'longTerm' || inj.start > date) return false;
  return statusOn(inj, date, data) !== 'cleared';
}

export function activeInjuries(date: ISODate, data: Data): ActiveInjury[] {
  const r = data.recovery;
  if (!r) return [];
  return r.injuries
    .filter((i) => isEpisodeActive(i, date, data))
    .map((injury) => {
      const events = eventsFor(injury.id, data, date);
      const cap = events.filter((e) => e.phaseCap).at(-1)?.phaseCap;
      return {
        injury,
        status: statusOn(injury, date, data),
        phase: phaseOn(injury, date, data),
        day: diffDays(date, injury.start),
        checkins: checkinsFor(injury.id, data, date),
        events,
        flags: openFlags(injury, date, data),
        phaseCap: cap,
        clearedLoading: events.some((e) => e.clearedLoading),
      };
    })
    .sort((a, b) => (a.injury.start < b.injury.start ? -1 : 1));
}

/** Standing limits typed on the phone (kind 'longTerm'). */
export const standingLimits = (date: ISODate, data: Data): Injury[] => (data.recovery?.injuries ?? []).filter((i) => i.kind === 'longTerm' && i.start <= date && statusOn(i, date, data) !== 'cleared');

export function injuryName(inj: Injury): string {
  const side = inj.side === 'left' ? 'Left ' : inj.side === 'right' ? 'Right ' : inj.side === 'both' ? 'Both sides, ' : '';
  const region = REGION_LABEL[inj.region];
  return `${side}${side && side !== 'Both sides, ' ? region.toLowerCase() : region}`;
}

export const checkedInToday = (a: ActiveInjury, date: ISODate) => a.checkins.some((c) => c.date === date);
