import { useEffect, useRef, useState } from 'react';
import { CloudCheck, CloudOff, Download, ExternalLink, KeyRound, RotateCcw, Shield, Upload } from 'lucide-react';
import type { ScreenProps } from '../App';
import { exportFile, mergeFile, saveProfile, setDevice } from '../db/store';
import { isBackupFile } from '../db/merge';
import { formatDateTime, formatMedium } from '../engine/dates';
import type { Profile } from '../engine/model';
import { pausesOf } from '../engine/position';
import { backupNow, onBackupStatus, restoreNow } from '../sync/backup';
import { checkAccess, friendly } from '../sync/github';
import { hashPin } from '../security/pin';
import { toast } from '../state/hooks';
import { Card, Chip, Field, NumInput, Seg, SectionTitle, Toggle } from '../ui/kit';

export const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Ragnarok%20backup&description=Lets%20Ragnarok%20back%20up%20to%20your%20private%20repository.&expires_in=none&contents=write';

export function Settings({ data, device, route, view }: ScreenProps) {
  const backupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (route[1] === 'backup') backupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [route]);
  const profile = data.profile as Profile;
  return (
    <div className="stack">
      <ProfileCard profile={profile} />
      <GymCard profile={profile} />
      <div ref={backupRef}>
        <BackupCard device={device} />
      </div>
      <ExportCard />
      <PinCard profile={profile} />
      <section className="section">
        <SectionTitle>Readiness calibration</SectionTitle>
        <Card>
          <div className="row between">
            <div>
              <div style={{ fontWeight: 600 }}>{view.calibration.active ? `Lines moved ${view.calibration.offset > 0 ? '+' : ''}${view.calibration.offset}` : 'Not active yet'}</div>
              <div className="tiny muted">{view.calibration.active ? `Full from ${75 + view.calibration.offset}, Moderate from ${65 + view.calibration.offset}, Light from ${50 + view.calibration.offset}. Never beyond 5.` : 'Starts after 8 weeks of check-ins.'}</div>
            </div>
            <button className="btn small" onClick={() => void saveProfile({ calibrationResetAt: view.date }).then(() => toast('Calibration reset'))}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </Card>
      </section>
      <section className="section">
        <SectionTitle>Plan pauses</SectionTitle>
        <Card>
          <div style={{ fontWeight: 600 }}>{pausesOf(data.plan).reduce((s, p) => s + p.days, 0)} days paused in total</div>
          {pausesOf(data.plan).map((p, i) => (
            <div key={i} className="tiny muted">{formatMedium(p.date)} · {p.days} days</div>
          ))}
          <a className="link-btn" href="#/train/pause">Pause or resume</a>
        </Card>
      </section>
      <a className="btn block ghost" href="#/about">About the plan</a>
      <Card tone="gold" tint>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Shield size={18} color="var(--gold)" />
          <div className="small">Not medical advice. Your doctor and osteopath cleared heavy lifting. Run any change past them.</div>
        </div>
      </Card>
      <div className="tiny muted center">Ragnarok · data stays on this phone and in your private backup. No analytics, no trackers.</div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile);
  useEffect(() => setP(profile), [profile]);
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);
  return (
    <section className="section" style={{ marginTop: 0 }}>
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <div className="stack">
          <Field label="Name"><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Height"><NumInput value={p.heightCm} onChange={(v) => setP({ ...p, heightCm: v })} unit="cm" label="Height" /></Field>
            <Field label="Birth year"><NumInput value={p.birthYear} onChange={(v) => setP({ ...p, birthYear: v })} label="Birth year" /></Field>
          </div>
          <Field label="Goal"><textarea className="input" rows={2} value={p.goal} onChange={(e) => setP({ ...p, goal: e.target.value })} /></Field>
          <Field label="Injuries and health"><textarea className="input" rows={3} value={p.injuries} onChange={(e) => setP({ ...p, injuries: e.target.value })} /></Field>
          <Field label="Training rules"><textarea className="input" rows={3} value={p.rules} onChange={(e) => setP({ ...p, rules: e.target.value })} /></Field>
          <div className="tiny muted">Used in the Ask Claude summary. Stays on this phone and in your private backup.</div>
          <button className="btn primary block" disabled={!dirty} onClick={() => void saveProfile(p).then(() => toast('Profile saved'))}>Save profile</button>
        </div>
      </Card>
    </section>
  );
}

function GymCard({ profile }: { profile: Profile }) {
  return (
    <section className="section">
      <SectionTitle>Gym</SectionTitle>
      <Card>
        <Toggle on={profile.safetyBar} onChange={(v) => void saveProfile({ safetyBar: v })} label="Safety-bar squat available" sub="Year 2 squat. Otherwise the back squat stays." />
        <Toggle on={profile.beltSquat} onChange={(v) => void saveProfile({ beltSquat: v })} label="Belt squat available" sub="Year 4 squat. Otherwise the back squat stays." />
        <div className="field" style={{ marginTop: 8 }}>
          <span>Dumbbell steps</span>
          <Seg label="Dumbbell steps" tone="frost" value={profile.dumbbellStep} onChange={(v) => void saveProfile({ dumbbellStep: v })} options={[1, 2, 2.5].map((v) => ({ value: v, label: `${v} kg` }))} />
        </div>
      </Card>
    </section>
  );
}

function BackupCard({ device }: { device: ScreenProps['device'] }) {
  const [user, setUser] = useState(device.ghUser ?? '');
  const [repo, setRepo] = useState(device.ghRepo ?? 'ragnarok-data');
  const [token, setToken] = useState(device.ghToken ?? '');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<string | null>(null);
  useEffect(() => onBackupStatus((s) => setState(s.state === 'running' ? 'Backing up…' : s.state === 'error' ? s.message ?? 'Error' : null)), []);
  const saved = device.ghUser === user.trim() && device.ghRepo === repo.trim() && device.ghToken === token.trim() && !!token;
  const store = async () => {
    await setDevice('ghUser', user.trim());
    await setDevice('ghRepo', repo.trim());
    await setDevice('ghToken', token.trim());
  };
  const connect = async () => {
    setBusy(true);
    try {
      const a = await checkAccess({ user, repo, token });
      if (!a.private) {
        toast('That repository is public. Use a private one.');
        return;
      }
      await store();
      toast((await backupNow('connect')) ? 'Connected. First backup done.' : 'Connected, backup failed. See below.');
    } catch (e) {
      toast(friendly(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!window.confirm('Load the backup from GitHub and merge it with this phone? Newer entries win.')) return;
    setBusy(true);
    try {
      if (!saved) await store();
      const n = await restoreNow();
      toast(n ? `Restored: ${n} entries merged` : 'Already up to date');
    } catch (e) {
      toast(friendly(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="section">
      <SectionTitle>Backup to GitHub</SectionTitle>
      <Card tone={device.lastBackupAt ? 'moss' : 'ember'} toned>
        <div className="stack">
          <div className="row">
            {device.lastBackupAt ? <CloudCheck size={20} color="var(--moss)" /> : <CloudOff size={20} color="var(--ember)" />}
            <div className="grow" style={{ fontWeight: 600 }}>{device.lastBackupAt ? `Last backup: ${formatDateTime(device.lastBackupAt)} ✓` : 'No backup yet'}</div>
          </div>
          {(state || device.lastBackupError) && <div className="small" style={{ color: state === 'Backing up…' ? 'var(--frost)' : 'var(--ember)' }}>{state ?? device.lastBackupError}</div>}
          <div className="tiny muted">Writes backup/latest.json to your private repository 2 minutes after a change, on open after 12 hours, and a monthly copy. Git keeps every version.</div>
          <Field label="GitHub username"><input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} /></Field>
          <Field label="Private repository"><input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={repo} onChange={(e) => setRepo(e.target.value)} /></Field>
          <Field label="Fine-grained token">
            <input className="input" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          <a className="btn block" href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
            <KeyRound size={16} /> Create the token on GitHub <ExternalLink size={14} />
          </a>
          <div className="tiny muted">On GitHub: Repository access → Only select repositories → {repo || 'ragnarok-data'}. Permission Contents: Read and write is pre-filled. Generate, copy, paste here. The token stays on this phone.</div>
          <button className="btn primary block" disabled={busy || !user || !repo || !token} onClick={() => void connect()}>{saved ? 'Check and back up now' : 'Save and back up now'}</button>
          <button className="btn block" disabled={busy || !user || !repo || !token} onClick={() => void restore()}>Restore from GitHub</button>
          {saved && <button className="link-btn" onClick={() => void Promise.all([setDevice('ghToken', undefined)]).then(() => { setToken(''); toast('Token removed from this phone'); })}>Remove the token from this phone</button>}
        </div>
      </Card>
    </section>
  );
}

function ExportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const download = async () => {
    const file = await exportFile();
    const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ragnarok-${file.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!isBackupFile(parsed)) throw new Error('Not a Ragnarok file');
      const n = await mergeFile(parsed);
      toast(`Imported: ${n} entries merged`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed');
    }
  };
  return (
    <section className="section">
      <SectionTitle>Export and import</SectionTitle>
      <Card>
        <div className="grid2">
          <button className="btn" onClick={() => void download()}><Download size={16} /> Export JSON</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import JSON</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void importFile(e.target.files?.[0])} />
        <div className="tiny muted" style={{ marginTop: 8 }}>A second safety net. Import merges per entry: the newer one wins.</div>
      </Card>
    </section>
  );
}

function PinCard({ profile }: { profile: Profile }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const ok = /^\d{4}$/.test(pin) && pin === again;
  const save = async () => {
    const { hash, salt } = await hashPin(pin);
    await saveProfile({ pinHash: hash, pinSalt: salt });
    setPin('');
    setAgain('');
    toast('PIN set');
  };
  return (
    <section className="section">
      <SectionTitle>PIN lock</SectionTitle>
      <Card>
        {profile.pinHash ? (
          <div className="row between">
            <Chip tone="moss">PIN on</Chip>
            <button className="btn small danger" onClick={() => void saveProfile({ pinHash: undefined, pinSalt: undefined }).then(() => toast('PIN removed'))}>Remove PIN</button>
          </div>
        ) : (
          <div className="stack">
            <div className="grid2">
              <Field label="4-digit PIN"><input className="input num" inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Again"><input className="input num" inputMode="numeric" type="password" maxLength={4} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <button className="btn block" disabled={!ok} onClick={() => void save()}>Set PIN</button>
            <div className="tiny muted">Stored hashed on this phone. Asked on open and after 5 minutes away.</div>
          </div>
        )}
      </Card>
    </section>
  );
}
