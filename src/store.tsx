import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addAttachment, dayKey, newId, newLog, today, type Attachment, type Log } from './model';
import { latestSnapshotAt, listSnapshots, takeSnapshot, UNREADABLE } from './safety';
import { parseBackup, serialize, sizeOf, type Files } from './backup';
import { isPinRecord, RELOCK_MS, type PinRecord } from './pin';
import * as storage from './storage';
import { useColors } from './theme';

const LOG_KEY = 'trip:v1';
const PIN_KEY = 'pin:v1';
/** Each attached file's bytes (a data URL) live under their own key: the trip itself stays small and quick to save. */
const FILE_PREFIX = 'file:v1:';

/** Stored data that failed validation, kept untouched so it can be downloaded, never silently overwritten. */
export interface Corrupt { raw: string; error: string }

interface Store {
  ready: boolean;
  log: Log | null;
  corrupt: Corrupt | null;
  saveError: string | null;
  pin: PinRecord | null;
  locked: boolean;
  /** First run: start a new trip (optionally from a backup or the old app's data). */
  start(from?: { log: Log; files?: Files }): Promise<void>;
  update(fn: (l: Log) => Log): void;
  /** Attach a file to a booking. Its bytes are written before the list that points at them. */
  addFile(bookingId: string, f: { name: string; type: string; data: string }): Attachment;
  readFile(id: string): Promise<string | null>;
  /** Every attached file's bytes, for a backup. */
  readFiles(): Promise<Files>;
  /** Swap in a whole trip (restore / undo). The current one goes to undo history first. */
  replace(next: { log: Log; files?: Files }, reason?: string): Promise<void>;
  /** Start an empty trip. What was here stays in undo history. */
  erase(): Promise<void>;
  /** Remove everything on this device, including undo history and the PIN. */
  wipe(): Promise<void>;
  setPin(rec: PinRecord | null): Promise<void>;
  unlock(): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const snapDay = useRef<string | null>(null); // day of the latest undo snapshot
  const [log, setLog] = useState<Log | null>(null);
  const [corrupt, setCorrupt] = useState<Corrupt | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pin, setPinRec] = useState<PinRecord | null>(null);
  const [locked, setLocked] = useState(false);
  const ref = useRef<{ log: Log | null }>({ log: null });

  // Single serial write queue for every write: one in flight, latest value per key wins, never out of order.
  const q = useRef<{ pending: Map<string, string>; drain: Promise<void> | null; error: Error | null }>({ pending: new Map(), drain: null, error: null });
  const persist = useCallback((key: string, value: string) => {
    q.current.pending.set(key, value);
    q.current.drain ??= (async () => {
      try {
        while (q.current.pending.size) {
          const [k, v] = q.current.pending.entries().next().value!;
          q.current.pending.delete(k);
          await storage.setItem(k, v);
        }
        q.current.error = null;
        setSaveError(null);
        storage.notifyChange();
      } catch (e) {
        q.current.error = e as Error;
        setSaveError(`Couldn't save your latest change (${(e as Error).message}). Export a backup now.`);
      } finally {
        q.current.drain = null;
        // A change that arrived while a failed write was in flight is still waiting: give it its own attempt.
        const left = q.current.pending.entries().next().value;
        if (left) persistRef.current(left[0], left[1]);
      }
    })();
  }, []);
  const persistRef = useRef(persist); // persist never changes (no deps), so the first value is the only one
  const idle = async () => { while (q.current.drain) await q.current.drain; };

  const show = useCallback((l: Log | null) => {
    ref.current = { log: l };
    setLog(l);
    setCorrupt(null);
  }, []);

  /**
   * Remove file bytes nothing points at any more: not the trip, not any undo snapshot, not a set-aside copy.
   * Skipped whenever the trip itself couldn't be read, since then "nothing points at it" would be a guess.
   */
  const collect = useCallback(async () => {
    const cur = ref.current.log;
    if (!cur) return;
    const keep = new Set<string>(cur.attachments.map((a) => a.id));
    for (const s of await listSnapshots()) {
      try { for (const a of parseBackup(s.data, true).log.attachments) keep.add(a.id); } catch { return; /* can't tell: keep everything */ }
    }
    const all = await storage.keys();
    for (const k of all.filter((x) => x.startsWith(UNREADABLE))) {
      try { for (const a of JSON.parse((await storage.getItem(k)) ?? '{}').attachments ?? []) if (typeof a?.id === 'string') keep.add(a.id); } catch { return; }
    }
    await idle();
    for (const k of all) if (k.startsWith(FILE_PREFIX) && !keep.has(k.slice(FILE_PREFIX.length))) await storage.removeItem(k);
  }, []);

  const load = useCallback(async () => {
    const latest = await latestSnapshotAt();
    snapDay.current = latest ? dayKey(new Date(latest)) : null;
    try {
      const p = JSON.parse((await storage.getItem(PIN_KEY)) ?? 'null');
      setPinRec(isPinRecord(p) ? p : null);
    } catch { setPinRec(null); }
    const raw = await storage.getItem(LOG_KEY);
    if (!raw) return show(null);
    try {
      show(parseBackup(raw, true).log); // own data is validated too
    } catch (e) {
      ref.current = { log: null };
      setLog(null);
      setCorrupt({ raw, error: (e as Error).message });
    }
  }, [show]);

  useEffect(() => {
    (async () => {
      try {
        await load();
        setLocked(!!ref.current.log && (await storage.getItem(PIN_KEY)) !== null);
        collect().catch(() => {}); // housekeeping, never blocks opening
      } catch (e) {
        setSaveError(`Couldn't open your data: ${(e as Error).message}`);
      }
      storage.requestPersistence();
      setReady(true);
    })();
    // Another tab wrote → reload, unless we have our own write in flight (ours is newer and will notify them).
    // ponytail: last-writer-wins across tabs; fine for one person, not for simultaneous multi-tab editing.
    return storage.onExternalChange(() => { if (!q.current.drain) load().catch(() => {}); });
  }, [load, collect]);

  // Ask for the PIN again after a minute away.
  const hiddenAt = useRef(0);
  const havePin = !!pin;
  useEffect(() => {
    if (!havePin || typeof document === 'undefined') return;
    const h = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_MS) setLocked(true);
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [havePin]);

  const store = useMemo<Store>(() => {
    // Swap in a whole new trip (import / erase / undo) through the same queue; throws if it couldn't be saved.
    const swap = async (next: Log, files: Files | undefined, reason = 'Before restore') => {
      // The undo point must exist before anything is replaced: if it can't be written, stop (the caller shows why).
      const before = ref.current.log;
      if (before) await takeSnapshot(before, reason);
      // An edit that landed while the snapshot was being written must not be lost either.
      if (ref.current.log && ref.current.log !== before) await takeSnapshot(ref.current.log, reason);
      for (const [id, data] of Object.entries(files ?? {})) persist(FILE_PREFIX + id, data); // bytes first, then what points at them
      show(next);
      persist(LOG_KEY, serialize(next));
      await idle();
      if (q.current.error) throw q.current.error;
    };
    const update: Store['update'] = (fn) => {
      const cur = ref.current.log;
      if (!cur) return;
      // First change of the day: keep the previous state in undo history.
      if (snapDay.current !== today()) {
        snapDay.current = today();
        takeSnapshot(cur, 'Start of day').catch(() => {}); // best effort; never blocks a save
      }
      const next = fn(cur);
      if (next === cur) return;
      ref.current = { log: next };
      setLog(next);
      persist(LOG_KEY, serialize(next));
    };
    return {
      ready, log, corrupt, saveError, pin, locked,
      async start(from) {
        await swap(from?.log ?? newLog(), from?.files, 'Before start');
      },
      update,
      addFile(bookingId, f) {
        const a: Attachment = { id: newId('f'), bookingId, name: f.name, type: f.type, size: sizeOf(f.data) };
        persist(FILE_PREFIX + a.id, f.data);
        update((l) => addAttachment(l, a));
        return a;
      },
      async readFile(id) {
        await idle(); // a file just attached may still be waiting in the queue
        return storage.getItem(FILE_PREFIX + id);
      },
      async readFiles() {
        const cur = ref.current.log;
        const out: Files = {};
        await idle();
        for (const a of cur?.attachments ?? []) {
          const data = await storage.getItem(FILE_PREFIX + a.id);
          if (data) out[a.id] = data;
        }
        return out;
      },
      replace: (next, reason) => swap(next.log, next.files, reason),
      async erase() {
        // If the old data was unreadable, keep a copy under a side key rather than destroying it.
        if (corrupt) await storage.setItem(`${UNREADABLE}${Date.now()}`, corrupt.raw);
        await swap(newLog(), {}, 'Before erase');
      },
      async wipe() {
        await idle();
        for (const k of await storage.keys()) await storage.removeItem(k);
        storage.notifyChange();
        snapDay.current = null;
        setPinRec(null);
        setLocked(false);
        show(null);
      },
      async setPin(rec) {
        if (rec) await storage.setItem(PIN_KEY, JSON.stringify(rec)); else await storage.removeItem(PIN_KEY);
        setPinRec(rec);
        setLocked(false);
      },
      unlock: () => setLocked(false),
    };
  }, [ready, log, corrupt, saveError, pin, locked, persist, show]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Inside the app (after Welcome), the log is always there. */
export function useLog(): Store & { log: Log } {
  const s = useStore();
  return { ...s, log: s.log! };
}

export function useTheme() {
  const { log } = useStore();
  return useColors(log?.settings.theme ?? 'system');
}
