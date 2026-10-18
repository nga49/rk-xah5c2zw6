import { DATA_TABLES, type DataTable, type Rows } from './db';

export type Snapshot = { [K in DataTable]: Rows[K][] };

export interface BackupFile {
  app: 'ragnarok';
  version: 1;
  exportedAt: string;
  /** Photos too large for the backup stay on the phone; their ids are listed here. */
  photosKeptLocal?: string[];
  tables: Partial<Snapshot>;
}

export function emptySnapshot(): Snapshot {
  return Object.fromEntries(DATA_TABLES.map((t) => [t, []])) as unknown as Snapshot;
}

export function isBackupFile(x: unknown): x is BackupFile {
  return !!x && typeof x === 'object' && (x as BackupFile).app === 'ragnarok' && typeof (x as BackupFile).tables === 'object';
}

/**
 * Per record, the newer `updatedAt` wins (deletes are records too, so they win when newer).
 * Returns the merged rows and, per table, the rows that must be written locally.
 */
export function mergeSnapshots(local: Partial<Snapshot>, remote: Partial<Snapshot>): { merged: Snapshot; toWrite: Snapshot; changed: number; localNewer: number } {
  const merged = emptySnapshot();
  const toWrite = emptySnapshot();
  let changed = 0;
  let localNewer = 0;
  for (const t of DATA_TABLES) {
    const byId = new Map<string, { updatedAt: number; id: string }>();
    const remoteIds = new Map<string, number>();
    for (const r of (remote[t] ?? []) as { updatedAt: number; id: string }[]) if (r && typeof r.id === 'string') remoteIds.set(r.id, r.updatedAt ?? 0);
    for (const r of (local[t] ?? []) as { updatedAt: number; id: string }[]) {
      byId.set(r.id, r);
      const theirs = remoteIds.get(r.id);
      if (theirs === undefined || (r.updatedAt ?? 0) > theirs) localNewer += 1;
    }
    for (const r of (remote[t] ?? []) as { updatedAt: number; id: string }[]) {
      if (!r || typeof r.id !== 'string') continue;
      const mine = byId.get(r.id);
      if (!mine || (r.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
        byId.set(r.id, r);
        (toWrite[t] as unknown[]).push(r);
        changed += 1;
      }
    }
    (merged as Record<string, unknown[]>)[t] = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return { merged, toWrite, changed, localNewer };
}
