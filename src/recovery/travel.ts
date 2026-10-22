// Life context: travel and gyms. The existing travel mode is never replaced: with "Smart travel" off it
// behaves exactly as before (injuries and red flags are still respected, in the engine). With it on:
// yoke-first kits, dated trips, short sessions, flight days, jet-lag context and a return ramp.
import { addDays, diffDays, formatMedium, startOfWeek, weekdayName } from '../engine/dates';
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import { modsForType, type PlannedExercise, type SessionPlan } from '../engine/session';
import type { Decision } from '../engine/readiness';
import type { ISODate } from '../plan/types';
import { isLowerLimb, KIT_LABEL, type RecordOf } from './model';
import { provideContext, provideInsights } from './registry';
import { injuryName } from './state';
import type { Kit } from './tags';

export type Trip = RecordOf<'trip'>;
export type Gym = RecordOf<'gym'>;

const smart = (data: Data) => data.recovery?.settings.smartTravel === true;
const trips = (data: Data): Trip[] => (data.recovery?.records ?? []).filter((r): r is Trip => r.kind === 'trip').sort((a, b) => (a.date < b.date ? -1 : 1));
export const gyms = (data: Data): Gym[] => (data.recovery?.records ?? []).filter((r): r is Gym => r.kind === 'gym');
export const activeGym = (data: Data): Gym | null => gyms(data).find((g) => g.id === data.recovery?.settings.activeGymId) ?? null;

export const tripOn = (date: ISODate, data: Data): Trip | null => trips(data).find((t) => t.date <= date && t.until >= date) ?? null;
/** The outbound and return days of a trip with a flight. */
export const flightOn = (date: ISODate, data: Data): Trip | null => trips(data).find((t) => !!t.flightHours && (t.date === date || t.until === date)) ?? null;

/** Travel today: the existing daily toggle, or (Smart travel) a dated trip. */
export const travelling = (date: ISODate, data: Data) => !!data.days.get(date)?.travelMode || (smart(data) && !!tripOn(date, data));

export const KIT_WORD: Record<Trip['kit'], string> = { bodyweight: 'Bodyweight only', bands: 'Bands', hotel: 'Hotel gym (dumbbells, bench)', full: 'Full gym' };
const KITS: Record<Trip['kit'], Set<Kit> | null> = {
  bodyweight: new Set<Kit>(['bodyweight']),
  bands: new Set<Kit>(['bodyweight', 'bands']),
  hotel: new Set<Kit>(['bodyweight', 'bands', 'dumbbells', 'bench', 'cable', 'machines']),
  full: null,
};
export const tripKit = (t: Trip | null): Set<Kit> => KITS[t?.kit ?? 'bodyweight'] ?? new Set<Kit>(['bodyweight']);

// ---------------------------------------------------------------- yoke-first travel kits

type Item = { name: string; sets: number; reps: string; muscles: string[]; equipment: PlannedExercise['equipment'] };
/** Yoke first: traps, side delts, rear delts, neck. HEURISTIC exercise choice; tagged in tags.ts. */
const YOKE_KIT: Record<Exclude<Trip['kit'], 'full'>, Item[]> = {
  bodyweight: [
    { name: 'Backpack Shrug', sets: 3, reps: '15-20', muscles: ['Traps'], equipment: 'none' },
    { name: 'Backpack Lateral Raise', sets: 3, reps: '15-20', muscles: ['Side delts'], equipment: 'none' },
    { name: 'Prone Y-Raise, bodyweight', sets: 3, reps: '12-15', muscles: ['Rear delts'], equipment: 'none' },
    { name: 'Neck Isometric Holds', sets: 2, reps: '20 s each way', muscles: ['Neck'], equipment: 'none' },
  ],
  bands: [
    { name: 'Band Shrug', sets: 3, reps: '15-20', muscles: ['Traps'], equipment: 'none' },
    { name: 'Band Lateral Raise', sets: 3, reps: '15-20', muscles: ['Side delts'], equipment: 'none' },
    { name: 'Band Face Pull', sets: 3, reps: '15-20', muscles: ['Rear delts'], equipment: 'none' },
    { name: 'Neck Isometric Holds', sets: 2, reps: '20 s each way', muscles: ['Neck'], equipment: 'none' },
  ],
  hotel: [
    { name: 'Dumbbell Shrug', sets: 3, reps: '12-15', muscles: ['Traps'], equipment: 'dumbbell' },
    { name: 'Dumbbell Lateral Raise', sets: 3, reps: '15', muscles: ['Side delts'], equipment: 'dumbbell' },
    { name: 'Incline Reverse Fly', sets: 3, reps: '15', muscles: ['Rear delts'], equipment: 'dumbbell' },
    { name: 'Neck Isometric Holds', sets: 2, reps: '20 s each way', muscles: ['Neck'], equipment: 'none' },
  ],
};
const SHORT_KEEP = ['Push-up', 'Backpack or Band Row'];

/** Smart travel: add the yoke kit to the hotel session; a short session keeps only the yoke, a push and a pull. */
export function smartTravelPlan(plan: SessionPlan, date: ISODate, data: Data): SessionPlan {
  const t = tripOn(date, data);
  const kit = t?.kit ?? 'bodyweight';
  if (kit === 'full' || plan.title !== 'Travel' || plan.kind === 'Walk + core') return plan;
  const short = !!t?.shortSessions;
  const base = short ? plan.exercises.filter((e) => SHORT_KEEP.includes(e.name)).map((e) => ({ ...e, sets: Math.min(2, e.sets), changes: [...e.changes, 'Short session'] })) : plan.exercises;
  const names = new Set(base.map((e) => e.name));
  const yoke: PlannedExercise[] = YOKE_KIT[kit].filter((it) => !names.has(it.name)).map((it, i) => ({
    key: `TRAVEL:yoke:${i}`,
    name: it.name,
    originalName: it.name,
    sets: short ? 2 : it.sets,
    reps: it.reps,
    repsTop: null,
    rest_s: 45,
    muscles: it.muscles,
    role: 'accessory',
    equipment: it.equipment,
    rir: '2',
    load: null,
    changes: [`Smart travel: yoke first (${KIT_WORD[kit].toLowerCase()})`],
  }));
  return {
    ...plan,
    exercises: [...yoke, ...base],
    focus: short ? 'Short session, about 20 min: yoke first, one push, one pull. RIR 2.' : plan.focus,
    notes: [short ? 'Short travel session: the yoke stays in.' : `Travel kit: ${KIT_WORD[kit]}. Yoke work first.`, ...plan.notes],
  };
}

// ---------------------------------------------------------------- the day: trips, flights, return

/** A trip turns its days into travel days; a flight day is a rest day. Never overrides Rest or Recovery. */
export function travelDecision(d: Decision, date: ISODate, data: Data): Decision {
  if (!smart(data) || d.mods.recovery || d.type === 'Recovery') return d;
  const f = flightOn(date, data);
  if (f) {
    return { ...d, type: 'Rest', suggested: 'Rest', mods: modsForType('Rest'), allowed: ['Rest'], canUseFull: false, reason: 'Flight day: walk, drink water, move every hour', why: [...d.why, `Flight of about ${f.flightHours} h. A rest day protects the next sessions.`] };
  }
  const t = tripOn(date, data);
  if (t && t.kit !== 'full' && !d.mods.rest && d.type !== 'Rest' && d.type !== 'Travel') {
    return { ...d, type: 'Travel', suggested: 'Travel', mods: modsForType('Travel'), canUseFull: false, reason: `Trip until ${formatMedium(t.until)}: ${KIT_WORD[t.kit].toLowerCase()}`, why: [...d.why, 'Smart travel: the trip sets travel days for you.'] };
  }
  return d;
}

/** Back from 4 or more days away: the first 2 sessions at Moderate loads. HEURISTIC. */
export function returnRamp(date: ISODate, data: Data): string | null {
  if (!smart(data)) return null;
  const t = [...trips(data)].reverse().find((x) => x.until < date && diffDays(date, x.until) <= 7);
  if (!t || diffDays(t.until, t.date) + 1 < 4) return null;
  let done = 0;
  for (let d = addDays(t.until, 1); d < date; d = addDays(d, 1)) if (data.days.get(d)?.sessionDone) done += 1;
  return done < 2 ? `back from ${diffDays(t.until, t.date) + 1} days away: first sessions at Moderate loads` : null;
}

/** Days of jet lag after a flight: about 1 per time zone flying east, zones / 1.5 flying west (CDC Yellow Book, approximate). */
export function jetLagDays(zones: number, direction: 'east' | 'west'): number {
  return Math.max(0, Math.round(direction === 'east' ? zones : zones / 1.5));
}

export function jetLag(date: ISODate, data: Data): { left: number; why: string } | null {
  if (!smart(data)) return null;
  for (const t of trips(data)) {
    if (!t.zones || !t.direction) continue;
    const legs: [ISODate, 'east' | 'west'][] = [[t.date, t.direction], [t.until, t.direction === 'east' ? 'west' : 'east']];
    for (const [arrive, dir] of legs) {
      const n = jetLagDays(t.zones, dir);
      const since = diffDays(date, arrive);
      if (since >= 1 && since <= n) return { left: n - since + 1, why: `${t.zones} time zones ${dir}: about ${n} day${n === 1 ? '' : 's'} to adjust (approximate).` };
    }
  }
  return null;
}

// Context: the active gym's kit on normal days, a trip's kit on travel days, and the return ramp.
provideContext((date, data) => {
  if (!data.recovery) return {};
  const gym = activeGym(data);
  const ease = returnRamp(date, data);
  const travel = travelling(date, data);
  const active = !!gym || !!ease || (smart(data) && (travel || !!flightOn(date, data)));
  if (!active) return {};
  const t = tripOn(date, data);
  const kit = travel ? (t?.kit === 'full' ? null : tripKit(t)) : gym ? new Set<Kit>(['bodyweight', ...gym.kit]) : null;
  return { active, ease, kit, kitLabel: travel ? KIT_WORD[t?.kit ?? 'bodyweight'] : gym?.name ?? null, enforceKit: !travel && !!gym };
});

// Today cards: the clot prompt on long flights after a leg injury, jet lag context.
provideInsights((date, data): Insight[] => {
  if (!smart(data)) return [];
  const out: Insight[] = [];
  const f = flightOn(date, data);
  // Sources: WHO Research Into Global Hazards of Travel (WRIGHT) 2007; Kahn SR et al., ACCP guideline,
  // Chest 2012;141:e195S; ASH 2018 guideline. Recent leg injury and long seated travel are listed risk
  // factors for clots. The app never suggests drugs or stocking pressures: that is for a clinician.
  const leg = (data.recovery?.injuries ?? []).find((i) => i.kind !== 'longTerm' && isLowerLimb(i.region) && i.start <= date && diffDays(date, i.start) <= 90);
  if (f && (f.flightHours ?? 0) >= 4 && leg) {
    out.push({
      id: `rec:clot:${date}`, priority: 95, tone: 'ember', icon: 'plane', area: 'safety', dismissible: true,
      title: 'Long flight after a leg injury: ask about clot precautions',
      body: 'Ask a doctor or pharmacist before you fly. On board: walk every hour, do calf pumps, take an aisle seat, drink water.',
      why: [`${injuryName(leg)} logged ${formatMedium(leg.start)}; flight about ${f.flightHours} h.`, 'Calf pain, swelling or breathlessness during or after the trip: seek medical care.', 'Not medical advice.'],
    });
  }
  if (f) {
    out.push({
      id: `rec:flight:${date}`, priority: 63, tone: 'frost', icon: 'plane', area: 'session', dismissible: true,
      title: 'Flight day: rest from lifting',
      body: 'Walk before boarding, get up every hour, drink water. Training picks up tomorrow.',
      why: ['Smart travel: flight days are rest days.'],
    });
  }
  const j = jetLag(date, data);
  if (j) {
    out.push({
      id: `rec:jetlag:${date}`, priority: 59, tone: 'frost', icon: 'moon', area: 'session', dismissible: true,
      title: `Jet lag: readiness may run low for about ${j.left} more day${j.left === 1 ? '' : 's'}`,
      body: 'Sessions stay as planned. If the badge feels too high, pick Moderate. Morning daylight helps.',
      why: [j.why],
    });
  }
  return out;
});

/** Guardian line: what travel this week does to the yoke, honestly. */
export function travelLine(date: ISODate, data: Data): string | null {
  const mon = startOfWeek(date);
  const days = [...Array(7).keys()].map((i) => addDays(mon, i)).filter((d) => travelling(d, data));
  if (!days.length) return null;
  const list = days.map((d) => weekdayName(d)).join(', ');
  return smart(data) ? `Travel on ${list}: yoke work kept with the travel kit.` : `Travel on ${list}: the hotel session has no yoke work. Smart travel in Settings adds it.`;
}

export const kitText = (kit: Gym['kit']) => kit.map((k) => KIT_LABEL[k]).join(', ');
