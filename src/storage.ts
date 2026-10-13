// Web storage: IndexedDB (no 5 MB localStorage cap). Other tabs are notified via BroadcastChannel.
const DB = 'trip-keeper';
const STORE = 'kv';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
  return dbp;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  return new Promise((ok, fail) => {
    tx.oncomplete = () => ok(req.result); // resolve only once durably committed
    tx.onerror = tx.onabort = () => fail(tx.error ?? req.error);
  });
}

export const getItem = async (key: string) => (await run<string | undefined>('readonly', (s) => s.get(key))) ?? null;
export const setItem = async (key: string, value: string) => { await run('readwrite', (s) => s.put(value, key)); };
export const removeItem = async (key: string) => { await run('readwrite', (s) => s.delete(key)); };
export const keys = async () => (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String);

/** Ask the browser not to evict our data (Safari may still refuse unless installed to Home Screen). */
export async function requestPersistence(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('trip-keeper') : null;
export const notifyChange = () => channel?.postMessage('changed');
export function onExternalChange(cb: () => void): () => void {
  if (!channel) return () => {};
  const h = () => cb();
  channel.addEventListener('message', h);
  return () => channel.removeEventListener('message', h);
}

/** Structured values (e.g. a non-extractable CryptoKey): IndexedDB stores them natively. */
export const getValue = async <T>(key: string) => (await run<T | undefined>('readonly', (s) => s.get(key))) ?? null;
export const setValue = async (key: string, value: unknown) => { await run('readwrite', (s) => s.put(value, key)); };
