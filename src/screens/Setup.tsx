import { useState } from 'react';
import { ArrowLeft, ArrowRight, CloudDownload } from 'lucide-react';
import { newId, put, setDevice } from '../db/store';
import { todayISO } from '../engine/dates';
import type { BfSource } from '../engine/model';
import { PLAN_START } from '../plan';
import { DEFAULT_RULES } from '../plan/content';
import type { LiftKey } from '../plan/types';
import { restoreNow } from '../sync/backup';
import { friendly } from '../sync/github';
import { toast } from '../state/hooks';
import { Card, Field, NumInput, Runes, Seg } from '../ui/kit';
import { TOKEN_URL } from './Settings';

const PLAN_GOAL = 'About 89 kg at about 15% body fat with a strong yoke (traps, shoulders, upper back), around autumn 2029. Calm, honest, trusted.';
const BENCHMARKS: { lift: LiftKey; label: string }[] = [
  { lift: 'bench', label: 'Bench press' },
  { lift: 'squat', label: 'Back squat' },
  { lift: 'ohp', label: 'Overhead press' },
  { lift: 'hipthrust', label: 'Hip thrust' },
  { lift: 'shrug', label: 'Barbell shrug' },
];

export function Setup() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [height, setHeight] = useState<number | undefined>();
  const [birth, setBirth] = useState<number | undefined>();
  const [weight, setWeight] = useState<number | undefined>();
  const [bf, setBf] = useState<number | undefined>();
  const [bfSrc, setBfSrc] = useState<BfSource>('scale');
  const [waist, setWaist] = useState<number | undefined>();
  const [maxes, setMaxes] = useState<Partial<Record<LiftKey, number>>>({});
  const [injuries, setInjuries] = useState('');
  const [goal, setGoal] = useState(PLAN_GOAL);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [user, setUser] = useState('');
  const [repo, setRepo] = useState('ragnarok-data');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayISO();

  const finish = async () => {
    setBusy(true);
    if (user && repo && token) {
      await setDevice('ghUser', user.trim());
      await setDevice('ghRepo', repo.trim());
      await setDevice('ghToken', token.trim());
    }
    for (const b of BENCHMARKS) {
      const v = maxes[b.lift];
      if (v) await put('maxes', { id: newId(), date: today, lift: b.lift, weightKg: v, reps: 1, e1rm: v, source: 'benchmark' });
    }
    if (weight != null || bf != null || waist != null) await put('body', { id: newId(), date: today, weightKg: weight, bodyFatPct: bf, bfSource: bf != null ? bfSrc : undefined, waistCm: waist });
    await put('profile', { id: 'me', name: name.trim() || 'Me', heightCm: height, birthYear: birth, goal, injuries, rules, startDate: PLAN_START, units: 'kg', dumbbellStep: 2, safetyBar: false, beltSquat: false });
    window.location.hash = '#/today';
  };

  const restore = async () => {
    setBusy(true);
    try {
      await setDevice('ghUser', user.trim());
      await setDevice('ghRepo', repo.trim());
      await setDevice('ghToken', token.trim());
      const n = await restoreNow();
      toast(`Restored ${n} entries`);
      window.location.hash = '#/today';
    } catch (e) {
      toast(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const nav = (canNext = true, last = false) => (
    <div className="grid2" style={{ marginTop: 6 }}>
      <button className="btn" onClick={() => setStep(step === 9 ? 0 : step - 1)}><ArrowLeft size={16} /> Back</button>
      {last ? (
        <button className="btn primary" disabled={busy} onClick={() => void finish()}>Start the road</button>
      ) : (
        <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next <ArrowRight size={16} /></button>
      )}
    </div>
  );

  return (
    <div className="app">
      <main className="main" style={{ paddingBottom: 40 }}>
        <div className="hero">
          <img src="icons/emblem.svg" alt="" width={96} height={96} />
          <h1>Ragnarok</h1>
          <div className="muted small" style={{ marginTop: 6 }}>{step === 0 ? 'Training and mindset, one day at a time.' : step === 9 ? 'Restore on a new phone' : `Setup · ${step} of 5`}</div>
        </div>
        <Runes />
        {step === 0 && (
          <div className="stack">
            <button className="btn primary block" onClick={() => setStep(1)}>Set up this phone</button>
            <button className="btn block" onClick={() => setStep(9)}><CloudDownload size={16} /> Restore from GitHub</button>
            <div className="tiny muted center">Your data stays on this phone and in your own private backup. No accounts, no analytics.</div>
          </div>
        )}
        {step === 1 && (
          <Card>
            <div className="stack">
              <div className="label">You</div>
              <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></Field>
              <div className="grid2">
                <Field label="Height"><NumInput value={height} onChange={setHeight} unit="cm" label="Height" /></Field>
                <Field label="Birth year"><NumInput value={birth} onChange={setBirth} label="Birth year" /></Field>
              </div>
              {nav(!!name.trim())}
            </div>
          </Card>
        )}
        {step === 2 && (
          <Card>
            <div className="stack">
              <div className="label">Body now</div>
              <div className="grid2">
                <Field label="Weight"><NumInput value={weight} onChange={setWeight} unit="kg" label="Weight" /></Field>
                <Field label="Waist (optional)"><NumInput value={waist} onChange={setWaist} unit="cm" label="Waist at the navel" /></Field>
              </div>
              <div className="grid2">
                <Field label="Body fat"><NumInput value={bf} onChange={setBf} unit="%" label="Body fat" /></Field>
                <Field group label="Source"><Seg label="Body fat source" tone="gold" value={bfSrc} onChange={setBfSrc} options={[{ value: 'DEXA', label: 'DEXA' }, { value: 'scale', label: 'Scale' }, { value: 'other', label: 'Other' }]} /></Field>
              </div>
              {nav()}
            </div>
          </Card>
        )}
        {step === 3 && (
          <Card>
            <div className="stack">
              <div className="label">Garmin 1RM benchmarks</div>
              <div className="tiny muted">Shown as unverified until a real 3RM test replaces them. Weighted pull-up is tested in M2.</div>
              {BENCHMARKS.map((b) => (
                <Field key={b.lift} label={b.label}>
                  <NumInput value={maxes[b.lift]} onChange={(v) => setMaxes({ ...maxes, [b.lift]: v })} unit="kg" label={`${b.label} 1RM`} />
                </Field>
              ))}
              {nav()}
            </div>
          </Card>
        )}
        {step === 4 && (
          <Card>
            <div className="stack">
              <div className="label">Health, goal and rules</div>
              <Field label="Injuries and health"><textarea className="input" rows={3} value={injuries} onChange={(e) => setInjuries(e.target.value)} placeholder="Old injuries, what flares them, who cleared you" /></Field>
              <Field label="Goal"><textarea className="input" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
              <Field label="Training rules"><textarea className="input" rows={3} value={rules} onChange={(e) => setRules(e.target.value)} /></Field>
              <div className="tiny muted">Only used in the Ask Claude summary you copy yourself. Not medical advice.</div>
              {nav()}
            </div>
          </Card>
        )}
        {step === 5 && (
          <Card>
            <div className="stack">
              <div className="label">Backup (optional, can wait)</div>
              <BackupFields user={user} repo={repo} token={token} setUser={setUser} setRepo={setRepo} setToken={setToken} />
              {nav(true, true)}
            </div>
          </Card>
        )}
        {step === 9 && (
          <Card>
            <div className="stack">
              <BackupFields user={user} repo={repo} token={token} setUser={setUser} setRepo={setRepo} setToken={setToken} />
              <button className="btn primary block" disabled={busy || !user || !repo || !token} onClick={() => void restore()}><CloudDownload size={16} /> Restore</button>
              <button className="btn block" onClick={() => setStep(0)}><ArrowLeft size={16} /> Back</button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

function BackupFields(p: { user: string; repo: string; token: string; setUser: (v: string) => void; setRepo: (v: string) => void; setToken: (v: string) => void }) {
  return (
    <>
      <Field label="GitHub username"><input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={p.user} onChange={(e) => p.setUser(e.target.value)} /></Field>
      <Field label="Private repository"><input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={p.repo} onChange={(e) => p.setRepo(e.target.value)} /></Field>
      <Field label="Fine-grained token"><input className="input" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="github_pat_…" value={p.token} onChange={(e) => p.setToken(e.target.value)} /></Field>
      <a className="link-btn" href={TOKEN_URL} target="_blank" rel="noopener noreferrer">Create the token on GitHub</a>
      <div className="tiny muted">Repository access → Only select repositories → {p.repo || 'ragnarok-data'}. Contents: Read and write.</div>
    </>
  );
}
