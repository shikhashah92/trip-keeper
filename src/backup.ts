// Pure backup logic (no platform I/O) so it can be unit tested with node --test.
import {
  EXPENSE_CATS, BOOKING_TYPES, SCHEMA_VERSION, isClock, isCurrency, isRealDay, isStamp,
  type Attachment, type Booking, type BookingType, type Expense, type ExpenseCat, type Item, type Log, type Theme, type Trip,
} from './model.ts';
import { COUNTRY } from './countries.ts';

export const BACKUP_APP = 'trip-keeper';
/** Attachments make a backup big: this is the most a file may hold, and the most a locked one may expand to (crypto.ts). */
export const MAX_IMPORT_BYTES = 150 * 1024 * 1024;
const MAX_LIST = 5000;
const MAX_FILE_DATA = 60 * 1024 * 1024;

/** The bytes of attached files, by attachment id: `data:<type>;base64,…`. */
export type Files = Record<string, string>;

/** Compact form used for on-device storage; parseBackup reads both. Attached files are stored separately. */
export const serialize = (l: Log) => JSON.stringify({ app: BACKUP_APP, ...l });

export function toBackupJSON(l: Log, files: Files): string {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: new Date().toISOString(), ...l, files });
}

const isStr = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const isId = (v: unknown): v is string => isStr(v, 100) && v.length > 0;
const isTime = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isDataUrl = (v: unknown): v is string => isStr(v, MAX_FILE_DATA) && /^data:[\w.+-]+\/[\w.+-]+(;[\w=.+-]+)*;base64,/.test(v);
const TYPES = new Set<string>(BOOKING_TYPES.map((t) => t.id));
const CATS = new Set<string>(EXPENSE_CATS.map((c) => c.id));
const clock = (v: unknown) => (v === '' || isClock(v) ? (v as string) : '');
const stamp = (v: unknown) => (v === '' || isStamp(v) ? (v as string) : '');

/**
 * Validate an untrusted backup (or our own stored copy) and return clean data (only known fields copied).
 * Throws Error with a human-readable message on the first problem found.
 * `stored`: our own copy on the device, where the files' bytes live under their own keys, so a listed file needs no data here.
 */
export function parseBackup(text: string, stored = false): { log: Log; files: Files } {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('File is too large to be a Trip Keeper backup.');
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!raw || typeof raw !== 'object') throw new Error('This is not a Trip Keeper backup file.');
  // The first (single-file) version had no `app` field: {v:1, trip, items, bookings, expenses, files: [{id, bookingId, name, type, data}]}.
  if (raw.app === undefined && raw.v === 1 && raw.trip) raw = fromV0(raw);
  if (raw.app !== BACKUP_APP) throw new Error('This is not a Trip Keeper backup file.');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new Error('Unknown backup version.');
  if (raw.schemaVersion > SCHEMA_VERSION) throw new Error('This backup is from a newer version of the app. Please update the app first.');
  const fail = (what: string, i: number): never => { throw new Error(`Backup is damaged: ${what} #${i + 1} is invalid.`); };
  for (const k of ['items', 'bookings', 'expenses', 'attachments'] as const) {
    if (!Array.isArray(raw[k])) throw new Error(`Backup is damaged: missing ${k}.`);
    if (raw[k].length > MAX_LIST) throw new Error(`Backup is damaged: too many ${k}.`);
  }
  const t = raw.trip;
  if (!t || typeof t !== 'object' || !isStr(t.name, 100)) throw new Error('Backup is damaged: the trip is missing.');
  const home = isCurrency(t.home) ? t.home : 'INR';
  const rates: Record<string, number> = {};
  if (t.rates && typeof t.rates === 'object') for (const [c, r] of Object.entries(t.rates)) if (isCurrency(c) && Number.isFinite(r) && (r as number) > 0 && (r as number) < 1e9) rates[c] = r as number;
  const day = (v: unknown) => (isRealDay(v) ? v : '');
  const start = day(t.start), end = day(t.end);
  const trip: Trip = {
    name: t.name.trim() || 'My Trip', start, end: start && end && end < start ? '' : end, final: t.final === true, home,
    budget: Number.isFinite(t.budget) && t.budget >= 0 && t.budget < 1e12 ? t.budget : 0, rates,
    ...(typeof t.country === 'string' && Object.hasOwn(COUNTRY, t.country) ? { country: t.country } : {}),
    ...(isCurrency(t.lastCur) ? { lastCur: t.lastCur } : {}),
  };

  const seen = new Set<string>();
  const unique = (key: string, what: string, i: number) => { if (seen.has(key)) fail(what, i); seen.add(key); };
  const items: Item[] = raw.items.map((i: any, n: number) => {
    if (!isId(i?.id) || !isStr(i.title, 200) || !i.title.trim() || !isRealDay(i.date)) fail('activity', n);
    unique(`i:${i.id}`, 'activity', n);
    return { id: i.id, title: i.title, date: i.date, time: clock(i.time), place: isStr(i.place, 300) ? i.place : '', notes: isStr(i.notes, 5000) ? i.notes : '' };
  });
  const bookings: Booking[] = raw.bookings.map((b: any, n: number) => {
    if (!isId(b?.id) || !isStr(b.title, 200) || !b.title.trim()) fail('booking', n);
    unique(`b:${b.id}`, 'booking', n);
    return { id: b.id, type: (TYPES.has(b.type) ? b.type : 'other') as BookingType, title: b.title, ref: isStr(b.ref, 100) ? b.ref : '',
      start: stamp(b.start), end: stamp(b.end), place: isStr(b.place, 300) ? b.place : '', notes: isStr(b.notes, 5000) ? b.notes : '' };
  });
  const bids = new Set(bookings.map((b) => b.id));
  const expenses: Expense[] = raw.expenses.map((e: any, n: number) => {
    if (!isId(e?.id) || !isRealDay(e.date) || !Number.isFinite(e.amount) || e.amount < 0 || e.amount > 1e12 || !isCurrency(e.currency)) fail('expense', n);
    unique(`x:${e.id}`, 'expense', n);
    return { id: e.id, date: e.date, amount: e.amount, currency: e.currency, cat: (CATS.has(e.cat) ? e.cat : 'other') as ExpenseCat, desc: isStr(e.desc, 300) ? e.desc : '' };
  });

  // Files: a listed file needs its bytes (unless this is our own stored copy), and a booking to belong to; anything else is dropped, never fatal.
  const rawFiles = raw.files && typeof raw.files === 'object' && !Array.isArray(raw.files) ? raw.files : {};
  const files: Files = {};
  const attachments: Attachment[] = [];
  for (const a of raw.attachments) {
    if (!isId(a?.id) || !bids.has(a.bookingId) || !isStr(a.name, 300) || (!stored && !isDataUrl(rawFiles[a.id])) || seen.has(`a:${a.id}`)) continue;
    seen.add(`a:${a.id}`);
    if (!stored) files[a.id] = rawFiles[a.id];
    const size = stored ? (Number.isSafeInteger(a.size) && a.size >= 0 ? a.size : 0) : sizeOf(rawFiles[a.id]);
    attachments.push({ id: a.id, bookingId: a.bookingId, name: a.name || 'file', type: isStr(a.type, 100) ? a.type : 'application/octet-stream', size });
  }

  const s = raw.settings ?? {};
  const theme: Theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  const log: Log = {
    schemaVersion: SCHEMA_VERSION, trip, items, bookings, expenses, attachments,
    settings: { theme, createdAt: isTime(s.createdAt) ? s.createdAt : 0,
      ...(isTime(s.lastBackupAt) ? { lastBackupAt: s.lastBackupAt } : {}),
      ...(typeof s.seenRelease === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.seenRelease) ? { seenRelease: s.seenRelease } : {}) },
  };
  return { log, files };
}

/** Decoded size of a base64 data URL, without decoding it. */
export function sizeOf(dataUrl: string): number {
  const at = dataUrl.indexOf(',') + 1;
  const pad = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(((dataUrl.length - at) * 3) / 4) - pad);
}

/** The first version's backup, as today's shape (parseBackup then validates it like any other). */
export function fromV0(raw: any): any {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const files = list(raw.files).filter((f: any) => f && typeof f.id === 'string');
  return {
    app: BACKUP_APP, schemaVersion: SCHEMA_VERSION,
    trip: { ...raw.trip, rates: raw.trip?.rates ?? {} },
    items: list(raw.items), bookings: list(raw.bookings), expenses: list(raw.expenses),
    attachments: files.map((f: any) => ({ id: f.id, bookingId: f.bookingId, name: f.name, type: f.type })),
    files: Object.fromEntries(files.map((f: any) => [f.id, f.data])),
    settings: { theme: 'system', createdAt: 0 },
  };
}

export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // a spreadsheet would run this as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Expenses, one row each, for a spreadsheet. */
export function toCSV(l: Log): string {
  const home = l.trip.home;
  const head = ['Date', 'Category', 'Description', 'Amount', 'Currency', `Rate to ${home}`, `Amount in ${home}`];
  const rate = (c: string) => (c === home ? 1 : l.trip.rates[c] ?? 0);
  const rows = [...l.expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const r = rate(e.currency);
    const label = EXPENSE_CATS.find((c) => c.id === e.cat)?.label ?? 'Other';
    return [e.date, label, e.desc, e.amount, e.currency, r || '', r ? (e.amount * r).toFixed(2) : ''].map(csvCell).join(',');
  });
  return [head.map(csvCell).join(','), ...rows].join('\n');
}

/** Newest first, capped: the undo history never grows without bound. */
export function pushSnapshot<T>(list: T[], snap: T, max = 10): T[] {
  return [snap, ...list].slice(0, max);
}
