import { todayISO } from '../engine/dates';
import { isBackupFile, type BackupFile } from '../db/merge';
import { allDevice, exportFile, getDevice, mergeFile, now, onChange, setDevice } from '../db/store';
import { friendly, getFile, putFile, type GhConfig } from './github';

export const LATEST = 'backup/latest.json';
export const monthlyPath = (month: string) => `backup/monthly/${month}.json`;
export const DEBOUNCE_MS = 2 * 60 * 1000;
export const STALE_MS = 12 * 60 * 60 * 1000;
export const WARN_MS = 3 * 24 * 60 * 60 * 1000;

export async function configured(): Promise<GhConfig | null> {
  const d = await allDevice();
  if (!d.ghUser || !d.ghRepo || !d.ghToken) return null;
  return { user: d.ghUser, repo: d.ghRepo, token: d.ghToken };
}

type Status = { state: 'idle' | 'running' | 'ok' | 'error'; message?: string };
let status: Status = { state: 'idle' };
const statusListeners = new Set<(s: Status) => void>();
export const backupStatus = () => status;
export function onBackupStatus(fn: (s: Status) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function setStatus(s: Status) {
  status = s;
  statusListeners.forEach((fn) => fn(s));
}

let running: Promise<boolean> | null = null;
let queued: Promise<boolean> | null = null;

/** Writes backup/latest.json, plus backup/monthly/YYYY-MM.json on the first backup of each month. */
export function backupNow(reason = 'auto'): Promise<boolean> {
  // A change during an upload gets its own upload right after, so nothing is left out.
  if (running) {
    queued ??= running.then(() => {
      queued = null;
      return backupNow(reason);
    });
    return queued;
  }
  running = (async () => {
    const cfg = await configured();
    if (!cfg) return false;
    setStatus({ state: 'running' });
    const startedAt = now();
    try {
      const file = await exportFile(new Date(startedAt).toISOString());
      const text = JSON.stringify(file);
      const stamp = new Date(startedAt).toISOString().slice(0, 16).replace('T', ' ');
      await putFile(cfg, LATEST, text, `Backup ${stamp} (${reason})`);
      const month = todayISO(new Date(startedAt)).slice(0, 7);
      if ((await getDevice('lastMonthly')) !== month) {
        await putFile(cfg, monthlyPath(month), text, `Monthly backup ${month}`);
        await setDevice('lastMonthly', month);
      }
      await setDevice('lastBackupAt', startedAt);
      await setDevice('lastBackupError', undefined);
      const pending = await getDevice('pendingAt');
      if (pending != null && pending <= startedAt) await setDevice('pendingAt', undefined);
      setStatus({ state: 'ok' });
      return true;
    } catch (e) {
      const message = friendly(e);
      await setDevice('lastBackupError', message);
      setStatus({ state: 'error', message });
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Loads backup/latest.json and merges it per record (newer `updatedAt` wins). */
export async function restoreNow(): Promise<number> {
  const cfg = await configured();
  if (!cfg) throw new Error('Set up the backup first.');
  const file = await getFile(cfg, LATEST);
  if (!file) throw new Error('No backup found in that repository yet.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    throw new Error('The backup file is not valid JSON.');
  }
  if (!isBackupFile(parsed)) throw new Error('That file is not a Ragnarok backup.');
  return mergeFile(parsed as BackupFile);
}

// ---------------------------------------------------------------- automatic schedule

/** Indirection so tests can check the delay without fake timers. */
export const timers = {
  set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clear: (t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

let timer: unknown = null;
let started = false;

function schedule(): void {
  if (timer) timers.clear(timer);
  timer = timers.set(() => {
    timer = null;
    void backupNow('change');
  }, DEBOUNCE_MS);
}

/** 2 minutes after the last change; on open when the last backup is over 12 hours old; when the app is hidden with pending changes. */
export function startAutoBackup(): () => void {
  if (started) return () => undefined;
  started = true;
  const off = onChange(schedule);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      void getDevice('pendingAt').then((p) => p != null && backupNow('hidden'));
    } else void checkOnOpen();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  void checkOnOpen();
  return () => {
    off();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    if (timer) timers.clear(timer);
    timer = null;
    started = false;
  };
}

export async function checkOnOpen(): Promise<boolean> {
  const d = await allDevice();
  if (!d.ghUser || !d.ghRepo || !d.ghToken) return false;
  const stale = !d.lastBackupAt || now() - d.lastBackupAt > STALE_MS;
  if (stale || d.pendingAt != null) return backupNow('open');
  return false;
}
