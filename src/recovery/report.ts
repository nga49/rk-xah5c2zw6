// The clinician report: one tap, on the device. Timeline, symptoms, check-in trends, loads before and
// after, current restrictions. Facts as logged by the owner; the app adds no diagnosis.
import { LIFTS } from '../plan';
import { formatMedium } from '../engine/dates';
import type { Data } from '../engine/model';
import { live } from '../engine/model';
import { unitsOf } from '../engine/units';
import type { ISODate } from '../plan/types';
import { FLAG_LABEL, MOVEMENT_LABEL, PHASE_WORD, STATUS_LABEL, TEST_LABEL, TYPE_LABEL, type FunctionalTest, type Injury } from './model';
import { PdfWriter } from './pdf';
import { phaseView } from './phases';
import { rxDose, rxFor } from './rx';
import { activeInjuries, checkinsFor, eventsFor, injuryName, statusOn } from './state';
import { tagsFor } from './tags';

const yesNo = (v: boolean | undefined) => (v == null ? 'not recorded' : v ? 'yes' : 'no');
const pain = (v: number | undefined) => (v == null ? '-' : String(v));
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function injuryReport(inj: Injury, date: ISODate, data: Data): Uint8Array {
  const u = unitsOf(data.profile);
  const w = new PdfWriter();
  const name = injuryName(inj);
  const active = activeInjuries(date, data).find((a) => a.injury.id === inj.id);
  const view = active ? phaseView(active, date) : null;
  w.h1(`Injury report: ${name}`);
  w.p(`Prepared ${formatMedium(date)} by the patient from a personal training log. Values are self-reported unless marked as from a clinician. Not a medical record.`, 9, 0.35);

  w.h2('Summary');
  w.kv('Area', `${name}${inj.location ? `, ${inj.location}` : ''}`);
  w.kv('Started', formatMedium(inj.start));
  w.kv('Type', `${TYPE_LABEL[inj.type ?? 'unknown']}${inj.grade ? `, grade ${inj.grade}` : ', grade not known'} (${inj.diagnosis === 'confirmed' ? 'confirmed by a clinician' : 'suspected'})`);
  w.kv('Status', `${STATUS_LABEL[statusOn(inj, date, data)]}${view ? `; training phase ${view.effective === 'stop' ? 'paused (red flag)' : PHASE_WORD[view.effective]}` : ''}`);
  const m = inj.mechanism;
  if (m) w.kv('How it happened', [m.exercise, m.kg != null ? u.w(m.kg) : null, m.rep != null ? `rep ${m.rep}` : null, m.felt ? `felt a ${m.felt}` : null, m.text].filter(Boolean).join(', ') || 'not recorded');
  if (inj.imaging) w.kv('Imaging', inj.imaging);
  if (inj.expectedReturn) w.kv('Expected return (estimate)', formatMedium(inj.expectedReturn));

  w.h2('Symptoms when logged');
  const a = inj.atLog ?? {};
  w.kv('Pain (0 to 10)', `rest ${pain(a.painRest)}, walking ${pain(a.painWalk)}, under load ${pain(a.painLoad)}`);
  w.kv('Swelling, bruising', `${yesNo(a.swelling)}, ${yesNo(a.bruising)}`);
  w.kv('Dip or lump', yesNo(a.lump));
  w.kv('Range of motion', a.rom ?? 'not recorded');
  const tests = Object.entries(a.tests ?? {}) as [FunctionalTest, boolean][];
  w.kv('Functional tests', tests.length ? tests.map(([k, v]) => `${TEST_LABEL[k]}: ${v ? 'yes' : 'no'}`).join('; ') : 'not recorded');
  w.kv('Red flags ticked', a.flags?.length ? a.flags.map((f) => FLAG_LABEL[f]).join('; ') : 'none');

  w.h2('Timeline');
  const events = eventsFor(inj.id, data, date);
  if (!events.length) w.p('No phase or status changes recorded.');
  for (const e of events) {
    const what = e.phase ? `${PHASE_WORD[e.phase]} phase` : e.status ? STATUS_LABEL[e.status] : e.event;
    w.p(`${formatMedium(e.date)}: ${what} (${e.by === 'clinician' ? 'clinician' : 'patient'})${e.note ? `. ${e.note}` : ''}`);
  }

  const checks = checkinsFor(inj.id, data, date);
  w.h2('Daily check-ins');
  if (checks.length) {
    w.chart(
      [
        { name: 'Rest', gray: 0.15, points: checks.map((c) => c.painRest ?? NaN).filter((x) => !Number.isNaN(x)) },
        { name: 'Walking', gray: 0.55, points: checks.map((c) => c.painWalk ?? NaN).filter((x) => !Number.isNaN(x)) },
      ],
      [formatMedium(checks[0].date), formatMedium(checks[checks.length - 1].date)],
    );
    w.p('Pain 0 to 10. Dashed line: the 3/10 limit used for loading.', 8, 0.4);
    w.table(
      ['Date', 'Rest', 'Walk', 'Session', 'Morning', 'Swelling', 'Confidence', 'Flags'],
      checks.slice(-30).map((c) => [formatMedium(c.date), pain(c.painRest), pain(c.painWalk), pain(c.painSession), pain(c.painMorning), c.swelling ? 'yes' : '-', c.confidence ? `${c.confidence}/5` : '-', c.flags?.length ? String(c.flags.length) : '-']),
      [80, 40, 40, 55, 55, 55, 65, 40],
    );
  } else w.p('No check-ins yet.');

  w.h2('Loads before and after');
  const names = Object.values(LIFTS).map((l) => l.name).filter((n) => {
    const t = tagsFor(n);
    return !t || [...t.regions, ...t.regions2].includes(inj.region);
  });
  const logs = live(data.weights).filter((x) => !x.assumed && names.includes(x.exercise)).sort((x, y) => (x.date < y.date ? -1 : 1));
  const before = logs.filter((x) => x.date < inj.start).slice(-5);
  const after = logs.filter((x) => x.date >= inj.start).slice(-10);
  if (!before.length && !after.length) w.p('No logged loads on lifts that use this area.');
  else w.table(['Date', 'Exercise', 'Load', 'When'], [...before.map((x) => [formatMedium(x.date), x.exercise, u.w(x.kg), 'before']), ...after.map((x) => [formatMedium(x.date), x.exercise, u.w(x.kg), 'after'])], [80, 220, 80, 80]);

  w.h2('Current restrictions');
  const r = inj.restrictions;
  w.kv('From a clinician', r?.text || 'none recorded');
  w.kv('Blocked movements', r?.blocked?.length ? r.blocked.map((x) => MOVEMENT_LABEL[x]).join(', ') : 'none');
  if (r?.until) w.kv('Until', formatMedium(r.until));
  const rx = rxFor(inj.id, date, data);
  if (rx) {
    w.kv('Physio prescription', `${rx.by ? `${rx.by}, ` : ''}from ${formatMedium(rx.date)}${rx.until ? ` to ${formatMedium(rx.until)}` : ''}`);
    for (const it of rx.items) w.p(`- ${it.name}: ${it.sets} x ${rxDose(it)}${it.perSide ? ' per side' : ''}${it.days?.length ? ` (${it.days.map((d) => DAY[d]).join(', ')})` : ' (daily)'}${it.note ? `. ${it.note}` : ''}`);
    if (rx.restrictions) w.kv('Physio restrictions', rx.restrictions);
  }
  if (inj.notes) {
    w.h2('Notes');
    w.p(inj.notes);
  }
  return w.bytes(`Injury report, ${name}, ${formatMedium(date)}`);
}

export function downloadReport(inj: Injury, date: ISODate, data: Data): void {
  const bytes = injuryReport(inj, date, data);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `injury-report-${date}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
