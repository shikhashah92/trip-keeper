// The PIN lock is a screen lock, not encryption: it keeps someone who picks up the phone out of the app. The data itself
// is not encrypted on the device. (A backup can be: see crypto.ts.) A short PIN can't resist offline guessing either way.
// The record is the first version's {salt, hash} as it was (hex SHA-256 of salt + PIN), so an existing PIN keeps working.

export interface PinRecord { salt: string; hash: string }
export const PIN_RE = /^\d{4,8}$/;
/** After this long in the background the app asks for the PIN again. */
export const RELOCK_MS = 60_000;

const hex = (u8: Uint8Array) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s: string) => hex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

export async function makePin(pin: string): Promise<PinRecord> {
  const salt = hex(globalThis.crypto.getRandomValues(new Uint8Array(8)));
  return { salt, hash: await sha(salt + pin) };
}
export async function checkPin(pin: string, rec: PinRecord): Promise<boolean> {
  return (await sha(rec.salt + pin)) === rec.hash;
}
export const isPinRecord = (v: unknown): v is PinRecord =>
  !!v && typeof v === 'object' && typeof (v as PinRecord).salt === 'string' && typeof (v as PinRecord).hash === 'string';
