// Undo history: the last 10 versions of the trip, kept on this device only.
import { parseBackup, pushSnapshot, serialize } from './backup';
import type { Log } from './model';
import * as storage from './storage';

export interface Snapshot { at: number; reason: string; count: number; data: string }
const SNAP_KEY = 'snapshots:v1';
const LATEST_KEY = 'snapshots-latest:v1'; // small, so loads don't parse the whole history
let chain: Promise<unknown> = Promise.resolve(); // serial: read-modify-write never interleaves

/**
 * Save a version to undo history. Resolves once written; rejects if it couldn't be written, so callers that promise
 * "you can undo this" (restore, erase, going back) can stop instead of losing data. Callers that don't care catch.
 */
export function takeSnapshot(log: Log, reason: string): Promise<void> {
  const snap = { at: Date.now(), reason, count: log.items.length + log.bookings.length + log.expenses.length, data: serialize(log) }; // captured now
  const job = chain.then(async () => {
    const list = await readSnapshots();
    await storage.setItem(SNAP_KEY, JSON.stringify(pushSnapshot(list, snap)));
    await storage.setItem(LATEST_KEY, String(snap.at));
  });
  chain = job.catch(() => {});
  return job;
}

export async function latestSnapshotAt(): Promise<number | null> {
  const v = Number(await storage.getItem(LATEST_KEY).catch(() => null));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function clearSnapshots(): Promise<void> {
  await chain;
  await storage.removeItem(SNAP_KEY);
  await storage.removeItem(LATEST_KEY);
}

async function readSnapshots(): Promise<Snapshot[]> {
  try {
    const raw = await storage.getItem(SNAP_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s?.at === 'number' && typeof s?.data === 'string').map((s) => ({ ...s, count: Number(s.count) || 0 })) : [];
  } catch { return []; }
}

/** Data that wouldn't open, set aside by "Start fresh" under this prefix and never deleted on its own. */
export const UNREADABLE = 'trip:v1:unreadable:';
export interface Unreadable { key: string; at: number; raw: string; log: Log | null }
/** Those copies, newest first. `log` is set when one opens now (a later app version can read what an earlier one couldn't). */
export async function unreadableCopies(): Promise<Unreadable[]> {
  const found = await Promise.all((await storage.keys()).filter((k) => k.startsWith(UNREADABLE)).map(async (key) => {
    const raw = (await storage.getItem(key)) ?? '';
    let log: Log | null = null;
    try { log = parseBackup(raw, true).log; } catch { /* still unreadable: it can be downloaded */ }
    return { key, at: Number(key.slice(UNREADABLE.length)) || 0, raw, log };
  }));
  return found.sort((a, b) => b.at - a.at);
}
export const forgetUnreadable = (key: string) => storage.removeItem(key);

export async function listSnapshots(): Promise<Snapshot[]> {
  await chain;
  return readSnapshots();
}
