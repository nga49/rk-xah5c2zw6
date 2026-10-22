// Wellness and possible accumulated fatigue. No single marker diagnoses overtraining
// (Meeusen R et al., ECSS/ACSM joint consensus statement, 2013), so signals are only combined and counted.
// Thresholds are HEURISTIC and conservative. The app says "possible accumulated fatigue", never a diagnosis.
import { addDays, diffDays, startOfWeek } from '../engine/dates';
import type { Insight } from '../engine/insights';
import type { Data } from '../engine/model';
import type { ISODate } from '../plan/types';
import { SIGN_LABEL, WELLNESS_SIGNS, type RecordOf, type WellnessCheckin } from './model';
import { provideContext, provideInsights } from './registry';

/** Watch: 2+ signals on 3+ of the last 7 days. Flag: the overtrained tap plus 1 signal, or 3+ signals on 5+ days. HEURISTIC. */
export const FATIGUE = {
  watch: { signals: 2, days: 3 },
  flag: { signals: 3, days: 5 },
  tapDays: 3,
  doctorDays: 14,
  blockDays: 5,
  source: 'Coaching heuristic; no single marker diagnoses overtraining (Meeusen 2013 ECSS/ACSM consensus)',
  evidence: 'heuristic',
} as const;

export type Fatigue = 'none' | 'watch' | 'flag';
export const FATIGUE_WORD: Record<Fatigue, string> = { none: 'Steady', watch: 'Watch', flag: 'Possible fatigue' };
export const FATIGUE_TONE: Record<Fatigue, 'moss' | 'gold' | 'ember'> = { none: 'moss', watch: 'gold', flag: 'ember' };

const entries = (data: Data): WellnessCheckin[] => data.recovery?.wellness ?? [];

/** Wellness entries that cover a date: the day's own, and earlier-told "going on for N days". */
function covering(d: ISODate, data: Data): WellnessCheckin[] {
  return entries(data).filter((w) => w.date === d || (w.signDays && w.date > d && diffDays(w.date, d) < w.signDays));
}

/** Every signal on a date, worded for the card. */
export function signalsOn(d: ISODate, data: Data): string[] {
  const out = new Set<string>();
  for (const w of covering(d, data)) for (const s of WELLNESS_SIGNS) if (w.signs?.[s]) out.add(SIGN_LABEL[s]);
  const own = entries(data).find((w) => w.date === d);
  if (own) {
    if ((own.soreness ?? 0) >= 7) out.add('High soreness');
    if ((own.mood ?? 5) <= 2) out.add('Low mood');
    if ((own.stress ?? 1) >= 4) out.add('High stress');
    if ((own.appetite ?? 5) <= 2) out.add('Low appetite');
  }
  const c = data.days.get(d)?.checkin;
  if (c?.hrvStatus === 'low') out.add('HRV low');
  if (c?.hrvStatus === 'unbalanced') out.add('HRV unbalanced');
  if (c?.restingHr != null) {
    const prev = [1, 2, 3, 4, 5, 6, 7].map((i) => data.days.get(addDays(d, -i))?.checkin?.restingHr).filter((x): x is number => x != null);
    const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
    // Same line the readiness score uses: 5 beats above the 7-day average.
    if (avg != null && c.restingHr > avg + 5) out.add('Resting HR up');
  }
  const sleeps = [0, 1, 2].map((i) => data.days.get(addDays(d, -i))?.checkin?.sleepMin).filter((x): x is number => x != null);
  if (sleeps.length === 3 && sleeps.reduce((a, b) => a + b, 0) / 3 < 390) out.add('Short sleep, 3-night average under 6 h 30');
  const low = [0, 1, 2, 3, 4].filter((i) => {
    const t = data.days.get(addDays(d, -i))?.readiness?.type;
    return t === 'Light' || t === 'Recovery';
  }).length;
  if (low >= 3) out.add('Low readiness on 3 of the last 5 days');
  return [...out];
}

export interface FatigueView {
  level: Fatigue;
  today: string[];
  /** Signals per day, last 7 days, oldest first. */
  week: { date: ISODate; signals: string[] }[];
  tapped: boolean;
  why: string[];
  /** Consecutive days with a logged sign, up to today. */
  persistDays: number;
  doctor: boolean;
  twitch: boolean;
  offer: { level: 'moderate' | 'light'; until: ISODate } | null;
  block: RecordOf<'recoveryBlock'> | null;
}

export function activeBlock(date: ISODate, data: Data): RecordOf<'recoveryBlock'> | null {
  const rows = (data.recovery?.records ?? []).filter((r): r is RecordOf<'recoveryBlock'> => r.kind === 'recoveryBlock' && r.date <= date && r.until >= date);
  return rows.sort((a, b) => a.updatedAt - b.updatedAt).at(-1) ?? null;
}

const memo = new WeakMap<Data, Map<ISODate, FatigueView>>();

export function fatigueOn(date: ISODate, data: Data): FatigueView {
  let m = memo.get(data);
  if (!m) memo.set(data, (m = new Map()));
  const hit = m.get(date);
  if (hit) return hit;
  const v = compute(date, data);
  m.set(date, v);
  return v;
}

function compute(date: ISODate, data: Data): FatigueView {
  const week = [6, 5, 4, 3, 2, 1, 0].map((i) => {
    const d = addDays(date, -i);
    return { date: d, signals: signalsOn(d, data) };
  });
  const today = week[6].signals;
  const tapped = entries(data).some((w) => w.overtrained && w.date <= date && diffDays(date, w.date) < FATIGUE.tapDays);
  const days2 = week.filter((x) => x.signals.length >= FATIGUE.watch.signals).length;
  const days3 = week.filter((x) => x.signals.length >= FATIGUE.flag.signals).length;
  const recentSignals = new Set(week.slice(-FATIGUE.tapDays).flatMap((x) => x.signals));
  let level: Fatigue = 'none';
  const why: string[] = [];
  if ((tapped && recentSignals.size >= 1) || days3 >= FATIGUE.flag.days) {
    level = 'flag';
    why.push(tapped ? 'You tapped "I feel overtrained", with other signs this week.' : `${FATIGUE.flag.signals}+ signs on ${days3} of the last 7 days.`);
  } else if (days2 >= FATIGUE.watch.days) {
    level = 'watch';
    why.push(`${FATIGUE.watch.signals}+ signs on ${days2} of the last 7 days.`);
  } else if (tapped) {
    why.push('You tapped "I feel overtrained". One more sign and the app offers lighter days.');
  }
  let persistDays = 0;
  for (let i = 0; i < 60; i++) {
    const d = addDays(date, -i);
    if (!covering(d, data).some((w) => WELLNESS_SIGNS.some((s) => w.signs?.[s]))) break;
    persistDays += 1;
  }
  const twitch = covering(date, data).some((w) => w.signs?.eyeTwitch);
  const block = activeBlock(date, data);
  const offerId = `rec:block:${date}`;
  const offer = level === 'flag' && !block && !data.dismissed.has(offerId) ? { level: (days3 >= FATIGUE.flag.days ? 'light' : 'moderate') as 'moderate' | 'light', until: addDays(date, FATIGUE.blockDays - 1) } : null;
  return { level, today, week, tapped, why, persistDays, doctor: persistDays >= FATIGUE.doctorDays, twitch, offer, block };
}

// Watch or flag: never add volume (no Guardian fills). Sessions only get lighter once a block is accepted.
provideContext((date, data) => {
  if (!data.recovery?.wellness.length && !data.recovery?.records.some((r) => r.kind === 'recoveryBlock')) return {};
  const f = fatigueOn(date, data);
  return { noFill: f.level !== 'none' ? 'possible accumulated fatigue' : null };
});

provideInsights((date, data): Insight[] => {
  if (!data.recovery?.wellness.length) return [];
  const f = fatigueOn(date, data);
  const out: Insight[] = [];
  const signs = f.today.length ? [`Today: ${f.today.join(', ')}.`] : [];
  if (f.level === 'flag' && f.offer) {
    out.push({
      id: `rec:block:${date}`, priority: 79, tone: 'gold', icon: 'reload', area: 'session', dismissible: true,
      title: 'Possible accumulated fatigue: a few lighter days?',
      body: `A recovery block: ${f.offer.level === 'light' ? 'Light' : 'Moderate'} sessions for ${FATIGUE.blockDays} days, more reps in reserve, no tests. You decide.`,
      why: [...f.why, ...signs, 'No single sign diagnoses overtraining.', 'Not medical advice.'],
      action: { kind: 'open', href: '#/recover/fatigue', label: 'Review' },
    });
  } else if (f.level === 'watch') {
    out.push({
      id: `rec:watch:${startOfWeek(date)}`, priority: 60, tone: 'gold', icon: 'moon', area: 'session', dismissible: true,
      title: 'Watch: signs of fatigue adding up',
      body: 'No extra volume for now. Sleep and easy walks come first.',
      why: [...f.why, ...signs],
      action: { kind: 'open', href: '#/recover/fatigue', label: 'Coach' },
    });
  }
  if (f.doctor) {
    out.push({
      id: `rec:doctor:${startOfWeek(date)}`, priority: 92, tone: 'ember', icon: 'alert', area: 'safety', dismissible: true,
      title: 'Signs for 2 weeks or more: consider seeing a doctor',
      body: 'To rule out other causes, even if training is lighter.',
      why: [`${f.persistDays} days in a row with a logged sign.`, 'Not medical advice.'],
    });
  }
  if (f.twitch) {
    out.push({
      id: `rec:twitch:${startOfWeek(date)}`, priority: 40, tone: 'frost', icon: 'eye', area: 'session', dismissible: true,
      title: 'Eye twitching logged',
      body: 'Often linked to stress, short sleep or caffeine. Counted as one sign, never on its own.',
      // Sources: StatPearls, "Eyelid Myokymia" (NBK560595); AAO EyeWiki.
      why: ['See a doctor if it lasts more than a few weeks, spreads to other parts of the face, or makes the eyelid close.', 'Not medical advice.'],
      action: { kind: 'open', href: '#/recover/fatigue', label: 'Coach' },
    });
  }
  return out;
});

/** Practical tips for the coach card. General guidance, not medical advice. */
export function coachTips(f: FatigueView, data: Data, date: ISODate): { title: string; text: string }[] {
  const w = entries(data).find((x) => x.date === date);
  const tips = [
    { title: 'Sleep', text: 'Aim for 7.5 h in bed, same wake time every day, phone out of the bedroom.' },
    { title: 'Breathing', text: 'Keep your daily 5 minutes of slow breathing. Add a second round before bed on stressful days.' },
    { title: 'Walks', text: 'An easy 20 to 30 minute walk outside, ideally in daylight. Easy means you can talk.' },
    // Caffeine late in the day disrupts sleep even 6 h before bed (Drake C et al., J Clin Sleep Med 2013).
    { title: 'Caffeine', text: `None in the 8 hours before bed.${w?.caffeineMg ? ` You logged ${w.caffeineMg} mg today${w.lastCaffeine ? `, last at ${w.lastCaffeine}` : ''}.` : ''} Up to about 400 mg a day is generally considered safe for healthy adults (FDA, EFSA); less helps sleep.` },
    { title: 'Stress', text: "Take one thing off this week's list. Training is a stress too: lighter days count as progress." },
    { title: 'Food', text: 'Eat enough on training days and spread protein over 3 to 4 meals. Alcohol hurts sleep quality.' },
  ];
  if (f.twitch) tips.push({ title: 'Eye twitching', text: 'Usually harmless and linked to stress, sleep and caffeine. See a doctor if it lasts more than a few weeks, spreads, or the eyelid closes.' });
  if (f.doctor) tips.unshift({ title: 'Doctor', text: `Signs for ${f.persistDays} days in a row: consider seeing a doctor to rule out other causes.` });
  return tips;
}
