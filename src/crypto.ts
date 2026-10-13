// Passphrase encryption for backups that leave the device (WebCrypto only: works in browsers and Node).
// gzip, then AES-256-GCM with a key from PBKDF2-SHA256 (600k iterations, OWASP 2023). The passphrase never leaves the device.
export const ITERATIONS = 600_000;
export const ENVELOPE_APP = 'trip-keeper-encrypted';
const ENVELOPE_APPS = new Set([ENVELOPE_APP]);

/** v1: plain JSON inside. v2: gzip-compressed JSON inside (logs compress well; photos less so). */
export interface Envelope { app: string; v: 1 | 2; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string }

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

export function toB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); // chunked: no stack overflow on MBs
  return btoa(s);
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

export const newSalt = () => toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));

/** Non-extractable key: it can be stored in IndexedDB and used, but its bytes can't be read back out. */
export async function deriveKey(passphrase: string, salt: string, iter = ITERATIONS): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations: iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Largest backup a file may expand to (the same cap as a plain backup file), and the PBKDF2 range we accept. */
export const MAX_PLAIN_BYTES = 150 * 1024 * 1024;
const MIN_ITER = 100_000, MAX_ITER = 2_000_000; // we write 600k; the cap stops a crafted file from freezing the phone

/** Run bytes through a (de)compression stream, stopping as soon as the output passes `limit` (zip-bomb guard). */
async function pipe(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('This backup is too large to open.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

export async function encryptWithKey(key: CryptoKey, salt: string, iter: number, plaintext: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12)); // fresh IV every time
  const packed = await pipe(enc.encode(plaintext), new CompressionStream('gzip'));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, packed));
  const e: Envelope = { app: ENVELOPE_APP, v: 2, kdf: 'PBKDF2-SHA256', iter, salt, iv: toB64(iv), ct: toB64(ct) };
  return JSON.stringify(e);
}

export function isEnvelope(text: string): boolean {
  try { return ENVELOPE_APPS.has(JSON.parse(text)?.app); } catch { return false; }
}

export async function decryptEnvelope(text: string, passphrase: string): Promise<string> {
  const e = JSON.parse(text) as Envelope;
  if ((e.v !== 1 && e.v !== 2) || e.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(e.iter) || e.iter < MIN_ITER || e.iter > MAX_ITER)
    throw new Error('This encrypted backup is from an unsupported version.');
  const key = await deriveKey(passphrase, e.salt, e.iter);
  let pt: Uint8Array<ArrayBuffer>;
  try {
    pt = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(e.iv) }, key, fromB64(e.ct)));
  } catch {
    throw new Error('That passphrase does not open this backup.');
  }
  return new TextDecoder().decode(e.v === 2 ? await pipe(pt, new DecompressionStream('gzip'), MAX_PLAIN_BYTES) : pt);
}

