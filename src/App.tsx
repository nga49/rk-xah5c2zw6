import { useEffect, useLayoutEffect, useState } from 'react';
import { Brain, ChartColumn, ClipboardList, Dumbbell, MessageCircle, Sun, X } from 'lucide-react';
import { startAutoBackup, WARN_MS } from './sync/backup';
import { syncReadiness } from './state/actions';
import { closeAsk, go, openAsk, stopRest, toast, useAsk, useData, useDay, useDevice, useRest, useRoute, useToast, useToday } from './state/hooks';
import { cx, UnitToggle } from './ui/kit';
import { saveProfile } from './db/store';
import { Today } from './screens/Today';
import { Train } from './screens/Train';
import { Mind } from './screens/Mind';
import { Log } from './screens/Log';
import { Stats } from './screens/Stats';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { Lock } from './screens/Lock';
import { Ask } from './screens/Ask';
import { About } from './screens/About';
import type { Data } from './engine/model';
import type { DayView } from './engine/today';
import type { DeviceSettings } from './db/store';

const TABS = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'train', label: 'Train', Icon: Dumbbell },
  { id: 'mind', label: 'Mind', Icon: Brain },
  { id: 'log', label: 'Log', Icon: ClipboardList },
  { id: 'stats', label: 'Stats', Icon: ChartColumn },
] as const;

const TITLES: Record<string, string> = { today: 'Today', train: 'Train', mind: 'Mind', log: 'Log', stats: 'Stats', settings: 'Settings', about: 'About the plan' };
const RELOCK_MS = 5 * 60 * 1000;

export interface ScreenProps {
  data: Data;
  view: DayView;
  device: DeviceSettings;
  route: string[];
  now: Date;
}

export function App() {
  const data = useData();
  const device = useDevice();
  const { date, now } = useToday();
  const view = useDay(data, date, now);
  const route = useRoute();
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => startAutoBackup(), []);

  // A new tab opens at its top; deep links such as settings/backup scroll themselves.
  const tab = route[0];
  const deep = !!route[1];
  useLayoutEffect(() => {
    if (!deep) window.scrollTo(0, 0);
  }, [tab, deep]);

  // Lock again after 5 minutes away.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MS) setUnlocked(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Keep the day's readiness snapshot in step with the engine (history, streak, charts).
  useEffect(() => {
    if (view?.decision.readiness) void syncReadiness(view);
  }, [view?.decision.type, view?.decision.readiness?.score, view?.decision.overridden, view?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !device) return <div className="app" aria-busy="true" />;
  if (!data.profile) return <Setup />;
  if (data.profile.pinHash && !unlocked) return <Lock profile={data.profile} onUnlock={() => setUnlocked(true)} />;
  if (!view) return <div className="app" aria-busy="true" />;

  const props: ScreenProps = { data, view, device, route, now };
  const backupOld = (!device.lastBackupAt && data.profile.updatedAt && Date.now() - firstUse(data) > WARN_MS) || (device.lastBackupAt != null && Date.now() - device.lastBackupAt > WARN_MS);

  return (
    <div className="app">
      <header className="header">
        <button className="mark" onClick={() => go('settings')} aria-label="Settings">
          <img src="icons/emblem.svg" alt="" width={40} height={40} />
        </button>
        <h1>{TITLES[tab] ?? 'Ragnarok'}</h1>
        <UnitToggle compact unit={data.profile.units === 'lb' ? 'lb' : 'kg'} onChange={(units) => void saveProfile({ units }).then(() => toast(units === 'lb' ? 'Pounds: every weight converted' : 'Kilos: every weight converted'))} />
        {backupOld && (
          <button className="chip t-ember" onClick={() => go('settings/backup')}>
            Backup
          </button>
        )}
      </header>
      <main className="main" id="main">
        {tab === 'today' && <Today {...props} backupOld={!!backupOld} />}
        {tab === 'train' && <Train {...props} />}
        {tab === 'mind' && <Mind {...props} />}
        {tab === 'log' && <Log {...props} />}
        {tab === 'stats' && <Stats {...props} />}
        {tab === 'settings' && <Settings {...props} />}
        {tab === 'about' && <About />}
        {!(tab in TITLES) && <Today {...props} backupOld={!!backupOld} />}
      </main>
      <RestTimerBar />
      <button className="fab" onClick={() => openAsk()} aria-label="Ask Claude" title="Ask Claude">
        <MessageCircle size={24} aria-hidden="true" />
      </button>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ id, label, Icon }) => (
          <a key={id} href={`#/${id}`} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={22} aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>
      <AskHost {...props} />
      <ToastHost />
    </div>
  );
}

function firstUse(data: Data): number {
  let first = Infinity;
  for (const d of data.days.values()) first = Math.min(first, d.updatedAt);
  return Number.isFinite(first) ? first : Date.now();
}

function AskHost(props: ScreenProps) {
  const ask = useAsk();
  if (!ask.open) return null;
  return <Ask {...props} initial={ask.prompt} onClose={closeAsk} />;
}

function ToastHost() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className="toast" role="status" key={t.id}>
      {t.text}
    </div>
  );
}

function RestTimerBar() {
  const rest = useRest();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000)) : 0;
  const done = !!rest && left === 0;
  useEffect(() => {
    if (done && 'vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
  }, [done]);
  if (!rest) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={cx('timer', done && 'done')} role="timer" aria-live="polite">
      <div className="t">{done ? 'Go' : `${mm}:${ss}`}</div>
      <div className="grow small">
        <div style={{ fontWeight: 700 }}>{done ? 'Rest over' : 'Rest'}</div>
        <div className="muted tiny">{rest.label}</div>
      </div>
      <button className="icon-btn" aria-label="Stop the timer" onClick={stopRest}>
        <X size={22} />
      </button>
    </div>
  );
}
