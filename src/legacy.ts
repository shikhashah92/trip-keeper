// Moving over from the first Trip Keeper (one HTML file, IndexedDB database "tripkeeper"). If it was served from the
// same address as this app, its data is still in this browser: read it and hand it to the same validation as a backup.
// Otherwise the person saves a backup there and restores it here (backup.ts reads that old format).

const LEGACY_DB = 'tripkeeper';
const STORES = ['items', 'bookings', 'files', 'expenses', 'meta'] as const;

/** Whether the first app's database exists here (it has data in it only if it has a trip record or any booking). */
export async function hasLegacyData(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB.databases) return false;
    if (!(await indexedDB.databases()).some((d) => d.name === LEGACY_DB)) return false;
    const data = await readStores();
    return !!data && !!(data.meta.trip || data.bookings.length || data.items.length || data.expenses.length);
  } catch { return false; }
}

type Rec = Record<string, any>;
async function readStores(): Promise<{ items: Rec[]; bookings: Rec[]; files: Rec[]; expenses: Rec[]; meta: Record<string, Rec> } | null> {
  const db = await new Promise<IDBDatabase | null>((ok) => {
    const req = indexedDB.open(LEGACY_DB); // no version: never upgrades (or creates) it
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ok(null);
    req.onupgradeneeded = () => { req.transaction!.abort(); ok(null); }; // it did not exist: nothing to read
  });
  if (!db) return null;
  try {
    const all = (name: string) => new Promise<Rec[]>((ok, fail) => {
      if (!db.objectStoreNames.contains(name)) return ok([]);
      const r = db.transaction(name).objectStore(name).getAll();
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    const [items, bookings, files, expenses, meta] = await Promise.all(STORES.map(all));
    return { items, bookings, files, expenses, meta: Object.fromEntries(meta.map((m) => [m.k, m])) };
  } finally { db.close(); }
}

const toDataUrl = (b: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(r.result as string);
  r.onerror = () => fail(r.error);
  r.readAsDataURL(b);
});

/** The first app's data as its own backup format; hand the text to parseBackup. Also returns its PIN record, if one was set. */
export async function readLegacy(): Promise<{ text: string; pin: { salt: string; hash: string } | null }> {
  const d = await readStores();
  if (!d) throw new Error('The first Trip Keeper’s data was not found on this device.');
  const files = await Promise.all(d.files.map(async (f) => ({ id: f.id, bookingId: f.bookingId, name: f.name, type: f.type, data: f.blob instanceof Blob ? await toDataUrl(f.blob) : '' })));
  const trip = d.meta.trip ?? { name: 'My Trip', start: '', end: '', final: false };
  const pin = d.meta.pin && typeof d.meta.pin.salt === 'string' && typeof d.meta.pin.hash === 'string' ? { salt: d.meta.pin.salt, hash: d.meta.pin.hash } : null;
  return { text: JSON.stringify({ v: 1, trip, items: d.items, bookings: d.bookings, expenses: d.expenses, files }), pin };
}

/** After a successful move, remove the first app's database (the data is in this app and in undo history). */
export function forgetLegacy(): Promise<void> {
  return new Promise((ok) => {
    const req = indexedDB.deleteDatabase(LEGACY_DB);
    req.onsuccess = req.onerror = req.onblocked = () => ok();
  });
}
