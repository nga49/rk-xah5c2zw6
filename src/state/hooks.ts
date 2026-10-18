import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { allDevice, loadData, type DeviceSettings } from '../db/store';
import { todayISO } from '../engine/dates';
import type { Data } from '../engine/model';
import { computeDay, type DayView } from '../engine/today';
import type { ISODate } from '../plan/types';

/** Everything in the database, re-read whenever a table changes. */
export function useData(): Data | undefined {
  return useLiveQuery(() => loadData(), []);
}

export function useDevice(): DeviceSettings | undefined {
  return useLiveQuery(() => allDevice(), []);
}

/** Today's local date. Rolls over at local midnight and when the app comes back to the screen. */
export function useToday(): { date: ISODate; now: Date } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60_000);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return { date: todayISO(now), now };
}

export function useDay(data: Data | undefined, date: ISODate, now: Date): DayView | null {
  const hour = now.getHours();
  return useMemo(() => (data ? computeDay(date, data, now) : null), [data, date, hour]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------- hash routes

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const readHash = () => window.location.hash.replace(/^#\/?/, '') || 'today';

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => 'today');
  return hash.split('/');
}

export function go(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path}`;
}

// ---------------------------------------------------------------- small global stores

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      subs.forEach((s) => s());
    },
    subscribe: (s: () => void) => {
      subs.add(s);
      return () => subs.delete(s);
    },
  };
}

const toastStore = store<{ text: string; id: number } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string): void {
  toastStore.set({ text, id: Date.now() });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastStore.set(null), 2600);
}
export const useToast = () => useSyncExternalStore(toastStore.subscribe, toastStore.get);

export interface RestTimer {
  endsAt: number;
  total: number;
  label: string;
}
const timerStore = store<RestTimer | null>(null);
export function startRest(seconds: number, label: string): void {
  if (seconds <= 0) return;
  timerStore.set({ endsAt: Date.now() + seconds * 1000, total: seconds, label });
}
export const stopRest = () => timerStore.set(null);
export const useRest = () => useSyncExternalStore(timerStore.subscribe, timerStore.get);

const askStore = store<{ open: boolean; prompt?: string }>({ open: false });
export const openAsk = (prompt?: string) => askStore.set({ open: true, prompt });
export const closeAsk = () => askStore.set({ open: false });
export const useAsk = () => useSyncExternalStore(askStore.subscribe, askStore.get);

export { db };
