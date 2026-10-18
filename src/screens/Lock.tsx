import { useState } from 'react';
import { Delete } from 'lucide-react';
import type { Profile } from '../engine/model';
import { checkPin } from '../security/pin';
import { cx, Embers, Laurel } from '../ui/kit';

export function Lock({ profile, onUnlock }: { profile: Profile; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [help, setHelp] = useState(false);
  const press = async (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setWrong(false);
    if (next.length === 4) {
      const ok = await checkPin(next, profile.pinHash as string, profile.pinSalt as string);
      if (ok) onUnlock();
      else {
        setWrong(true);
        setPin('');
      }
    }
  };
  return (
    <div className="app">
      <div className="hero-art" aria-hidden="true" />
      <Embers n={12} />
      <main className="main" style={{ paddingBottom: 40 }}>
        <div className="hero" style={{ paddingTop: 'max(7vh, 32px)' }}>
          <div className="crest">
            <Laurel className="laurel" size={168} />
            <img src="icons/mark.svg" alt="" width={92} height={92} />
          </div>
          <h1 style={{ fontSize: 30 }}>Ragnarok</h1>
        </div>
        <div className="pindots" aria-label={`${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => <i key={i} className={cx(i < pin.length && 'on')} />)}
        </div>
        <div className="center small" style={{ minHeight: 22, color: 'var(--ember)' }} role="alert">{wrong ? 'Wrong PIN' : ''}</div>
        <div className="pinpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => void press(d)}>{d}</button>
          ))}
          <span />
          <button onClick={() => void press('0')}>0</button>
          <button aria-label="Delete" onClick={() => setPin(pin.slice(0, -1))} style={{ display: 'grid', placeItems: 'center' }}>
            <Delete size={24} />
          </button>
        </div>
        <div className="center" style={{ marginTop: 22 }}>
          <button className="link-btn" onClick={() => setHelp(!help)}>Forgot the PIN?</button>
          {help && <div className="small muted" style={{ maxWidth: 320, margin: '6px auto 0' }}>There is no back door. Remove the app's website data in iPhone Settings, open the app again and choose Restore from GitHub.</div>}
        </div>
      </main>
    </div>
  );
}
