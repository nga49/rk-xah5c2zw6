// Milestone 7: acceptance test 16 (backup, restore, merge) with a mocked GitHub API.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RagnarokDB, useDatabase } from '../src/db/db';
import { mergeSnapshots } from '../src/db/merge';
import { exportFile, mergeFile, patchDay, put, remove, setClock, setDevice, snapshot } from '../src/db/store';
import { backupNow, DEBOUNCE_MS, LATEST, restoreNow, startAutoBackup, timers } from '../src/sync/backup';
import { fromBase64, toBase64 } from '../src/sync/github';

/** A tiny in-memory GitHub: contents API with sha checks, as the real one behaves. */
function mockGitHub() {
  const files = new Map<string, { sha: string; text: string }>();
  let n = 0;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;
    calls.push(`${method} ${path}`);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== 'Bearer test-token') return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
    const m = path.match(/^\/repos\/nico\/ragnarok-data(?:\/contents\/(.+))?$/);
    if (!m) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    const file = m[1];
    if (!file) return new Response(JSON.stringify({ private: true, permissions: { push: true } }), { status: 200 });
    if (method === 'GET') {
      const f = files.get(file);
      if (!f) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      return new Response(JSON.stringify({ sha: f.sha, encoding: 'base64', content: toBase64(f.text) }), { status: 200 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      const existing = files.get(file);
      if (existing && body.sha !== existing.sha) return new Response(JSON.stringify({ message: 'sha mismatch' }), { status: 409 });
      if (!existing && body.sha) return new Response(JSON.stringify({ message: 'sha given for a new file' }), { status: 422 });
      files.set(file, { sha: `sha${++n}`, text: fromBase64(body.content) });
      return new Response(JSON.stringify({ content: { sha: `sha${n}` } }), { status: existing ? 200 : 201 });
    }
    return new Response('', { status: 405 });
  });
  return { files, calls, fetchMock };
}

async function device(name: string) {
  const d = new RagnarokDB(`${name}-${Math.random()}`);
  useDatabase(d);
  await setDevice('ghUser', 'nico');
  await setDevice('ghRepo', 'ragnarok-data');
  await setDevice('ghToken', 'test-token');
  return d;
}

let gh: ReturnType<typeof mockGitHub>;
let t = Date.parse('2026-10-20T07:00:00Z');
beforeEach(() => {
  gh = mockGitHub();
  vi.stubGlobal('fetch', gh.fetchMock);
  setClock(() => (t += 1000));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acceptance 16: automatic backup to GitHub', () => {
  it('a change schedules a write to backup/latest.json 2 minutes later (each change restarts the timer)', async () => {
    await device('a');
    const scheduled: { fn: () => void; ms: number }[] = [];
    const cleared: unknown[] = [];
    const realSet = timers.set;
    const realClear = timers.clear;
    timers.set = (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; };
    timers.clear = (h) => { cleared.push(h); };
    const stop = startAutoBackup();
    try {
      await patchDay('2026-10-20', { steps: 8000 });
      await patchDay('2026-10-20', { steps: 9000 });
      expect(scheduled.at(-1)?.ms).toBe(DEBOUNCE_MS);
      expect(DEBOUNCE_MS).toBe(120_000);
      expect(cleared.length).toBeGreaterThanOrEqual(1);
      expect(gh.files.has(LATEST)).toBe(false);
      scheduled.at(-1)!.fn();
      await vi.waitFor(() => expect(JSON.parse(gh.files.get(LATEST)?.text ?? '{"tables":{"days":[{}]}}').tables.days[0].steps).toBe(9000));
      const saved = JSON.parse(gh.files.get(LATEST)!.text);
      expect(saved.app).toBe('ragnarok');
      expect(saved.tables.days[0]).toMatchObject({ id: '2026-10-20', steps: 9000 });
      expect(gh.files.has('backup/monthly/2026-10.json')).toBe(true);
    } finally {
      stop();
      timers.set = realSet;
      timers.clear = realClear;
    }
  });

  it('updates send the current sha; the monthly file is written once a month', async () => {
    await device('b');
    await put('cardio', { id: 'c1', date: '2026-10-20', type: 'rower', minutes: 20, feel: 'easy' });
    expect(await backupNow()).toBe(true);
    await put('cardio', { id: 'c2', date: '2026-10-21', type: 'bike', minutes: 30, feel: 'easy' });
    expect(await backupNow()).toBe(true);
    expect(gh.calls.filter((c) => c === 'PUT /repos/nico/ragnarok-data/contents/backup/monthly/2026-10.json')).toHaveLength(1);
    expect(gh.calls.filter((c) => c === 'PUT /repos/nico/ragnarok-data/contents/backup/latest.json')).toHaveLength(2);
    expect(JSON.parse(gh.files.get(LATEST)!.text).tables.cardio).toHaveLength(2);
  });

  it('restore on an empty device reproduces identical data', async () => {
    await device('phone1');
    await put('profile', { id: 'me', name: 'N', goal: 'g', injuries: 'private text', rules: 'r', startDate: '2026-10-19', units: 'kg', dumbbellStep: 2, safetyBar: false, beltSquat: false });
    await patchDay('2026-10-20', { checkin: { sleepMin: 450, sleepScore: 80, energy: 4, stress: 2, backPain: 0, kneePain: 0 }, steps: 11000, code: [true, false, true, false, false] });
    await put('maxes', { id: 'm1', date: '2026-10-18', lift: 'bench', weightKg: 100, reps: 1, e1rm: 100, source: 'benchmark' });
    await put('weights', { id: 'w1', date: '2026-10-20', exercise: 'Face Pull', kg: 25, mark: 'clean' });
    await put('body', { id: 'b1', date: '2026-10-20', weightKg: 86.4, waistCm: 90 });
    await remove('weights', 'w1');
    await backupNow();
    const before = await snapshot();

    await device('phone2');
    expect((await snapshot()).days).toHaveLength(0);
    const changed = await restoreNow();
    expect(changed).toBeGreaterThan(0);
    expect(await snapshot()).toEqual(before);
  });

  it('merge keeps the newer record, deletes included', () => {
    const local = { days: [{ id: '2026-10-20', steps: 5000, updatedAt: 200 }, { id: '2026-10-21', steps: 7000, updatedAt: 100 }], weights: [{ id: 'w', exercise: 'x', kg: 10, date: '2026-10-20', updatedAt: 100 }] };
    const remote = { days: [{ id: '2026-10-20', steps: 3000, updatedAt: 100 }, { id: '2026-10-21', steps: 9000, updatedAt: 300 }, { id: '2026-10-22', steps: 1, updatedAt: 50 }], weights: [{ id: 'w', exercise: 'x', kg: 10, date: '2026-10-20', deleted: true, updatedAt: 150 }] };
    const { merged, changed, localNewer } = mergeSnapshots(local, remote);
    expect(merged.days.find((d) => d.id === '2026-10-20')?.steps).toBe(5000);
    expect(merged.days.find((d) => d.id === '2026-10-21')?.steps).toBe(9000);
    expect(merged.days).toHaveLength(3);
    expect(merged.weights[0].deleted).toBe(true);
    expect(changed).toBe(3);
    expect(localNewer).toBe(1);
  });

  it('merging a file into a device with newer local edits keeps them and marks a new backup', async () => {
    await device('c');
    await patchDay('2026-10-20', { steps: 4000 });
    const file = await exportFile();
    await patchDay('2026-10-20', { steps: 12000 });
    await mergeFile(file);
    const s = await snapshot();
    expect(s.days[0].steps).toBe(12000);
  });

  it('a wrong token reports a plain message and keeps the data', async () => {
    await device('d');
    await setDevice('ghToken', 'nope');
    await patchDay('2026-10-20', { steps: 1 });
    expect(await backupNow()).toBe(false);
  });

  it('base64 round-trips runes and accents', () => {
    const s = 'ᚱ ᚨ ᚷ Ragnarök · été';
    expect(fromBase64(toBase64(s))).toBe(s);
  });
});
