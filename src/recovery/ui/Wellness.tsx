import { useState } from 'react';
import { HeartPulse, Moon } from 'lucide-react';
import type { Data } from '../../engine/model';
import { addDays, formatMedium } from '../../engine/dates';
import type { ISODate } from '../../plan/types';
import { go, toast } from '../../state/hooks';
import { Card, Chip, Field, NumInput, Sheet, SectionTitle, Toggle } from '../../ui/kit';
import { saveRecord, saveWellness } from '../actions';
import { SIGN_LABEL, WELLNESS_SIGNS, type WellnessSign } from '../model';
import { coachTips, FATIGUE_TONE, FATIGUE_WORD, fatigueOn } from '../wellness';
import { PainSeg, Picks, Scale5 } from './widgets';

/** Recover screen: today's wellness status, the block offer, the coach card. */
export function WellnessSection({ data, date }: { data: Data; date: ISODate }) {
  const f = fatigueOn(date, data);
  const logged = data.recovery?.wellness.some((w) => w.date === date);
  const start = async () => {
    if (!f.offer) return;
    await saveRecord<'recoveryBlock'>({ kind: 'recoveryBlock', date, until: f.offer.until, level: f.offer.level, reason: 'possible accumulated fatigue', sourceId: `rec:block:${date}` });
    toast(`Recovery block until ${formatMedium(f.offer.until)}`);
  };
  const end = async () => {
    if (!f.block) return;
    await saveRecord<'recoveryBlock'>({ ...f.block, until: addDays(date, -1) });
    toast('Recovery block ended');
  };
  return (
    <section className="section" aria-label="Wellness">
      <SectionTitle>Wellness</SectionTitle>
      <Card tone={FATIGUE_TONE[f.level]} toned={f.level !== 'none'}>
        <div className="row between">
          <div className="row" style={{ gap: 8 }}>
            <HeartPulse size={18} style={{ color: `var(--${FATIGUE_TONE[f.level]})` }} />
            <span style={{ fontWeight: 700 }}>{FATIGUE_WORD[f.level]}</span>
          </div>
          {f.block && <Chip tone="gold">Recovery block</Chip>}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>{f.today.length ? `Today: ${f.today.join(', ')}.` : 'No signs logged today.'}</div>
        {f.why.map((w) => <div key={w} className="small" style={{ marginTop: 4 }}>{w}</div>)}
        {f.level !== 'none' && <div className="small" style={{ marginTop: 4 }}>No extra volume is added while signs add up.</div>}
        <button className={logged ? 'btn block' : 'btn primary block'} style={{ marginTop: 10 }} onClick={() => go('recover/wellness')}>
          {logged ? 'Wellness check-in done · edit' : 'Wellness check-in · 30 s'}
        </button>
      </Card>
      {f.offer && (
        <Card tone="gold" toned>
          <div style={{ fontWeight: 700 }}>A few lighter days?</div>
          <div className="small" style={{ marginTop: 4 }}>
            {f.offer.level === 'light' ? 'Light' : 'Moderate'} sessions until {formatMedium(f.offer.until)}: fewer sets, lighter loads, one more rep in reserve, no tests, no extra volume. Your plan blocks stay as they are.
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>A short easy stretch now usually costs far less than pushing through fatigue. You decide.</div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => void start()}>Start recovery block</button>
        </Card>
      )}
      {f.block && (
        <Card>
          <div className="small">Recovery block until {formatMedium(f.block.until)} ({f.block.level === 'light' ? 'Light' : 'Moderate'}): {f.block.reason}.</div>
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => void end()}>End it today</button>
        </Card>
      )}
      <CoachCard data={data} date={date} />
    </section>
  );
}

export function CoachCard({ data, date }: { data: Data; date: ISODate }) {
  const f = fatigueOn(date, data);
  const tips = coachTips(f, data, date);
  return (
    <Card>
      <div className="row" style={{ gap: 8 }}><Moon size={16} style={{ color: 'var(--frost)' }} /><span className="label">Recovery coach</span></div>
      <div className="stack tight" style={{ marginTop: 8 }}>
        {tips.map((t) => (
          <div key={t.title} className="small"><span style={{ fontWeight: 700 }}>{t.title}.</span> <span className="muted">{t.text}</span></div>
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>General guidance, not medical advice.</div>
    </Card>
  );
}

/** The fast wellness form. Resting HR and HRV come from the existing morning check-in. */
export function WellnessSheet({ data, date, open }: { data: Data; date: ISODate; open: boolean }) {
  return (
    <Sheet open={open} title="Wellness check-in" onClose={() => go('recover')}>
      {open && <WellnessBody key={date} data={data} date={date} />}
    </Sheet>
  );
}

function WellnessBody({ data, date }: { data: Data; date: ISODate }) {
  const prev = data.recovery?.wellness.find((w) => w.date === date);
  const [signs, setSigns] = useState<WellnessSign[]>(WELLNESS_SIGNS.filter((s) => prev?.signs?.[s]));
  const [signDays, setSignDays] = useState<number | undefined>(prev?.signDays);
  const [soreness, setSoreness] = useState<number | undefined>(prev?.soreness);
  const [mood, setMood] = useState(prev?.mood);
  const [stress, setStress] = useState(prev?.stress);
  const [appetite, setAppetite] = useState(prev?.appetite);
  const [caffeine, setCaffeine] = useState<number | undefined>(prev?.caffeineMg);
  const [lastCaffeine, setLastCaffeine] = useState(prev?.lastCaffeine ?? '');
  const [alcohol, setAlcohol] = useState<number | undefined>(prev?.alcoholUnits);
  const [overtrained, setOvertrained] = useState(!!prev?.overtrained);
  const [notes, setNotes] = useState(prev?.notes ?? '');
  const save = async () => {
    await saveWellness({
      date,
      signs: signs.length ? Object.fromEntries(signs.map((s) => [s, true])) : undefined,
      signDays: signs.length && signDays ? Math.max(1, Math.round(signDays)) : undefined,
      soreness, mood, stress, appetite,
      caffeineMg: caffeine, lastCaffeine: lastCaffeine || undefined, alcoholUnits: alcohol,
      overtrained: overtrained || undefined,
      notes: notes.trim() || undefined,
    });
    toast('Wellness saved');
    go('recover');
  };
  return (
    <div className="stack">
      <Toggle on={overtrained} onChange={setOvertrained} tone="ember" label="I feel overtrained" sub="One tap. Combined with other signs, the app offers lighter days." />
      <Field group label="Signs today">
        <Picks label="Signs today" tone="gold" value={signs} onChange={setSigns} options={WELLNESS_SIGNS.map((s) => ({ value: s, label: SIGN_LABEL[s] }))} />
      </Field>
      {signs.length > 0 && <Field label="Going on for how many days?"><NumInput value={signDays} onChange={setSignDays} unit="days" label="Days" min={1} /></Field>}
      <PainSeg label="Muscle soreness" value={soreness} onChange={setSoreness} />
      <Scale5 label="Mood (1 low, 5 great)" value={mood} onChange={setMood} tone="moss" />
      <Scale5 label="Stress (1 calm, 5 high)" value={stress} onChange={setStress} tone="gold" />
      <Scale5 label="Appetite (1 none, 5 normal)" value={appetite} onChange={setAppetite} />
      <div className="row" style={{ gap: 8 }}>
        <div className="grow"><Field label="Caffeine"><NumInput value={caffeine} onChange={setCaffeine} unit="mg" label="Caffeine" min={0} /></Field></div>
        <div className="grow"><Field label="Last caffeine"><input className="input" type="time" value={lastCaffeine} onChange={(e) => setLastCaffeine(e.target.value)} aria-label="Last caffeine" /></Field></div>
      </div>
      <Field label="Alcohol"><NumInput value={alcohol} onChange={setAlcohol} unit="units" label="Alcohol" min={0} /></Field>
      <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="tiny muted">Resting HR and HRV come from your morning check-in (More from Garmin).</div>
      <button className="btn primary block" onClick={() => void save()}>Save wellness</button>
      <div className="tiny muted">Not medical advice.</div>
    </div>
  );
}
