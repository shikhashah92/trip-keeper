// The data model and every change to it, as pure functions (no platform I/O), so it can be unit tested with node --test.
// One Log holds the whole trip. Attached files are stored apart (their bytes can be large); the Log keeps only a list.

/** Bump when the stored shape changes, and teach parseBackup (backup.ts) to read the old one. */
export const SCHEMA_VERSION = 1;

export type Theme = 'system' | 'light' | 'dark';

export type BookingType = 'flight' | 'hotel' | 'airbnb' | 'car' | 'train' | 'activity' | 'insurance' | 'other';
/** `icon` is an Ionicons name for the app; `emoji` is for text a person shares or puts in a calendar. */
export const BOOKING_TYPES: { id: BookingType; label: string; icon: string; emoji: string }[] = [
  { id: 'flight', label: 'Flight', icon: 'airplane', emoji: '✈️' },
  { id: 'hotel', label: 'Hotel', icon: 'bed', emoji: '🏨' },
  { id: 'airbnb', label: 'Airbnb', icon: 'home', emoji: '🏠' },
  { id: 'car', label: 'Car rental', icon: 'car', emoji: '🚗' },
  { id: 'train', label: 'Train / Bus', icon: 'train', emoji: '🚆' },
  { id: 'activity', label: 'Activity / Ticket', icon: 'ticket', emoji: '🎟️' },
  { id: 'insurance', label: 'Insurance / Visa', icon: 'shield-checkmark', emoji: '🛡️' },
  { id: 'other', label: 'Other', icon: 'document-text', emoji: '📄' },
];
export const BOOKING_TYPE = (id: string) => BOOKING_TYPES.find((t) => t.id === id) ?? BOOKING_TYPES[BOOKING_TYPES.length - 1];
/** Bookings with a start and an end that are two events (check-in and check-out), not one. */
export const STAY: ReadonlySet<BookingType> = new Set<BookingType>(['hotel', 'airbnb', 'car']);

export type ExpenseCat = 'food' | 'transport' | 'fuel' | 'stay' | 'sights' | 'shop' | 'other';
export const EXPENSE_CATS: { id: ExpenseCat; label: string; icon: string; emoji: string }[] = [
  { id: 'food', label: 'Food & drink', icon: 'restaurant', emoji: '🍽️' },
  { id: 'transport', label: 'Transport', icon: 'bus', emoji: '🚕' },
  { id: 'fuel', label: 'Fuel & tolls', icon: 'speedometer', emoji: '⛽' },
  { id: 'stay', label: 'Stay', icon: 'bed', emoji: '🏨' },
  { id: 'sights', label: 'Sightseeing', icon: 'ticket', emoji: '🎟️' },
  { id: 'shop', label: 'Shopping', icon: 'bag-handle', emoji: '🛍️' },
  { id: 'other', label: 'Other', icon: 'cash', emoji: '💸' },
];
export const EXPENSE_CAT = (id: string) => EXPENSE_CATS.find((c) => c.id === id) ?? EXPENSE_CATS[EXPENSE_CATS.length - 1];

export interface Trip {
  name: string;
  /** "YYYY-MM-DD" local days, or '' when not set yet. */
  start: string;
  end: string;
  /** Planning is done: the itinerary is no longer a draft. */
  final: boolean;
  country?: string;
  /** Home currency (3 letters). Totals are in this. */
  home: string;
  budget: number;
  /** One global rate per currency: 1 unit = this many `home`. */
  rates: Record<string, number>;
  /** The currency of the last expense, offered first next time. */
  lastCur?: string;
}
/** A planned stop of your own (not a booking). */
export interface Item { id: string; title: string; date: string; time: string; place: string; notes: string }
/** `start` / `end` are "YYYY-MM-DDTHH:MM" local, or ''. */
export interface Booking {
  id: string; type: BookingType; title: string; ref: string; start: string; end: string; place: string; notes: string;
  /** IANA zones the start and end are in (a flight leaves one place and lands in another). The times stay as written. */
  startTz?: string; endTz?: string;
}
export interface Expense { id: string; date: string; amount: number; currency: string; cat: ExpenseCat; desc: string }
/** A file on a booking (ticket, voucher, PDF). The bytes live under their own storage key; see store.tsx. */
export interface Attachment { id: string; bookingId: string; name: string; type: string; size: number }

export interface Settings {
  theme: Theme;
  /** When this trip was created (ms): the backup reminder counts from here until the first backup. */
  createdAt: number;
  lastBackupAt?: number;
  /** The date of the newest What's new card the person has seen. */
  seenRelease?: string;
}
export interface Log {
  schemaVersion: number;
  trip: Trip;
  items: Item[];
  bookings: Booking[];
  expenses: Expense[];
  attachments: Attachment[];
  settings: Settings;
}

export const newLog = (now = Date.now()): Log => ({
  schemaVersion: SCHEMA_VERSION,
  trip: { name: 'My Trip', start: '', end: '', final: false, home: 'INR', budget: 0, rates: {} },
  items: [], bookings: [], expenses: [], attachments: [],
  settings: { theme: 'system', createdAt: now },
});

export const newId = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- days ("YYYY-MM-DD", always the phone's local day) ----

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dayKey(new Date());
const atDay = (day: string) => new Date(`${day}T00:00`);
export const addDays = (day: string, n: number) => { const d = atDay(day); d.setDate(d.getDate() + n); return dayKey(d); };
/** Whole days from a to b (negative if b is earlier). Rounded: a daylight-saving change is 23 or 25 hours. */
export const diffDays = (a: string, b: string) => Math.round((atDay(b).getTime() - atDay(a).getTime()) / 864e5);
export const isRealDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayKey(atDay(v)) === v;
export const isClock = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** "YYYY-MM-DDTHH:MM", the native date-and-time field's value. */
export const isStamp = (v: unknown): v is string => typeof v === 'string' && isRealDay(v.slice(0, 10)) && v[10] === 'T' && isClock(v.slice(11));
export const splitStamp = (s: string): [string, string] => { const [d, t = ''] = s.split('T'); return [d, t]; };

const L = 'en-IN';
export const fmtDate = (day: string) => atDay(day).toLocaleDateString(L, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtLong = (day: string) => atDay(day).toLocaleDateString(L, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtStamp = (s: string) => (s ? new Date(s).toLocaleString(L, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
/** "Day 3" for a day of the trip, or '' before the trip's dates are set. */
export const dayLabel = (t: Trip, day: string) => (t.start ? `Day ${diffDays(t.start, day) + 1}` : '');

// ---- the itinerary: your own stops and every dated booking, in one sorted list ----

export interface TripEvent {
  date: string; time: string; emoji: string; icon: string; title: string; sub: string; place: string;
  src: 'item' | 'booking'; id: string; type?: BookingType;
  /** The zone this time is in, e.g. "IST, UTC+5:30", when the booking says. */
  tz?: string;
}

export function events(l: Log): TripEvent[] {
  const out: TripEvent[] = [];
  for (const i of l.items) out.push({ date: i.date, time: i.time, emoji: '📍', icon: 'location', title: i.title, sub: [i.place, i.notes].filter(Boolean).join(' · '), place: i.place, src: 'item', id: i.id });
  for (const b of l.bookings) {
    if (!b.start) continue;
    const [d, t] = splitStamp(b.start);
    const kind = BOOKING_TYPE(b.type);
    const stay = STAY.has(b.type);
    const bits = [b.place, b.ref ? `Ref ${b.ref}` : ''];
    if (!stay && b.end) bits.push(`until ${splitStamp(b.end)[1]}`);
    out.push({ date: d, time: t, emoji: kind.emoji, icon: kind.icon, title: (b.type === 'car' ? 'Pick-up: ' : stay ? 'Check-in: ' : '') + b.title,
      sub: bits.filter(Boolean).join(' · '), place: b.place, src: 'booking', id: b.id, type: b.type,
      ...(b.startTz && t ? { tz: zoneLabel(b.startTz, b.start) } : {}) });
    if (stay && b.end) {
      const [d2, t2] = splitStamp(b.end);
      out.push({ date: d2, time: t2, emoji: kind.emoji, icon: kind.icon, title: (b.type === 'car' ? 'Drop-off: ' : 'Check-out: ') + b.title,
        sub: b.place, place: b.place, src: 'booking', id: b.id, type: b.type });
    }
  }
  return out.sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
}

export const mapUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
export const NEARBY: { label: string; icon: string; query: string }[] = [
  { label: 'Restaurants', icon: 'restaurant', query: 'restaurants' },
  { label: 'Cafés', icon: 'cafe', query: 'cafes' },
  { label: 'ATMs', icon: 'card', query: 'atms' },
  { label: 'Pharmacies', icon: 'medkit', query: 'pharmacies' },
  { label: 'Supermarkets', icon: 'cart', query: 'supermarkets' },
  { label: 'Public transport', icon: 'subway', query: 'public transport' },
  { label: 'Petrol stations', icon: 'speedometer', query: 'petrol stations' },
  { label: 'Parking', icon: 'car', query: 'parking' },
];

/** The big line on Today: how far off the trip is, which day it is, or that it's over. */
export function hero(t: Trip, day: string): { title: string; sub: string } {
  if (!t.start) return { title: 'Welcome', sub: 'Open More and set your trip name and dates' };
  const toStart = diffDays(day, t.start);
  if (toStart > 0) return { title: `${plural(toStart, 'day')} to go`, sub: `Trip starts ${fmtLong(t.start)}` };
  if (!t.end || day <= t.end) return { title: `Day ${-toStart + 1}${t.end ? ` of ${diffDays(t.start, t.end) + 1}` : ''}`, sub: fmtLong(day) };
  return { title: 'Trip complete', sub: 'Hope it was wonderful' };
}

/** What Today shows: today, tomorrow, and (only if both are empty) the next day with plans. */
export function todayView(l: Log, day: string) {
  const ev = events(l);
  const tomorrow = addDays(day, 1);
  const now = ev.filter((e) => e.date === day);
  const next = ev.filter((e) => e.date === tomorrow);
  const upcoming = !now.length && !next.length ? ev.find((e) => e.date > tomorrow) : undefined;
  return { today: now, tomorrow: next, tomorrowDay: tomorrow, upcomingDay: upcoming?.date, upcoming: upcoming ? ev.filter((e) => e.date === upcoming.date) : [] };
}

/** Days that have anything planned, in order, each with its events. */
export function byDay(ev: TripEvent[]): { day: string; events: TripEvent[] }[] {
  const days = [...new Set(ev.map((e) => e.date))];
  return days.map((day) => ({ day, events: ev.filter((e) => e.date === day) }));
}

export const sortedBookings = (l: Log) => [...l.bookings].sort((a, b) => (a.start || '9').localeCompare(b.start || '9'));
export const filesOf = (l: Log, bookingId: string) => l.attachments.filter((a) => a.bookingId === bookingId);

// ---- money ----

export const rateOf = (t: Trip, cur: string) => (cur === t.home ? 1 : t.rates[cur] ?? 0);
/** An expense in the home currency, or null when its currency has no rate yet (left out of totals, and flagged). */
export const toHome = (t: Trip, e: Expense): number | null => { const r = rateOf(t, e.currency); return r ? e.amount * r : null; };
export function money(n: number, cur: string): string {
  try { return new Intl.NumberFormat(L, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n); } catch { return `${cur} ${n.toFixed(2)}`; }
}
export const isCurrency = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);

export function spend(l: Log, day: string) {
  const t = l.trip;
  const conv = l.expenses.map((e) => ({ e, h: toHome(t, e) }));
  const total = conv.reduce((a, x) => a + (x.h ?? 0), 0);
  const missing = [...new Set(conv.filter((x) => x.h === null).map((x) => x.e.currency))];
  const cats = new Map<string, number>();
  for (const x of conv) if (x.h !== null) cats.set(x.e.cat, (cats.get(x.e.cat) ?? 0) + x.h);
  const byCat = [...cats].sort((a, b) => b[1] - a[1]);
  const paid = new Map<string, number>();
  for (const e of l.expenses) paid.set(e.currency, (paid.get(e.currency) ?? 0) + e.amount);
  // Spend per day so far: over the days of the trip that have happened, never more than its length.
  let perDay: number | null = null;
  if (t.start && l.expenses.length && day >= t.start) {
    const elapsed = diffDays(t.start, day);
    const days = Math.max(1, Math.min(elapsed, t.end ? diffDays(t.start, t.end) : Infinity) + 1);
    perDay = total / days;
  }
  const bud = t.budget || 0;
  return { total, missing, byCat, paid: [...paid], perDay, budget: bud, left: bud ? bud - total : null };
}

/** Expense days, newest first, each with its list and its total in the home currency. */
export function expenseDays(l: Log): { day: string; list: Expense[]; sum: number }[] {
  const days = [...new Set(l.expenses.map((e) => e.date))].sort().reverse();
  return days.map((day) => {
    const list = l.expenses.filter((e) => e.date === day);
    return { day, list, sum: list.reduce((a, e) => a + (toHome(l.trip, e) ?? 0), 0) };
  });
}

// ---- changes (each returns a new Log) ----

const upsert = <T extends { id: string }>(list: T[], x: T): T[] => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]);

export const putTrip = (l: Log, patch: Partial<Trip>): Log => ({ ...l, trip: { ...l.trip, ...patch } });
export const putItem = (l: Log, i: Item): Log => ({ ...l, items: upsert(l.items, i) });
export const delItem = (l: Log, id: string): Log => ({ ...l, items: l.items.filter((i) => i.id !== id) });
export const putBooking = (l: Log, b: Booking): Log => ({ ...l, bookings: upsert(l.bookings, b) });
/** A booking goes with its files (the bytes are cleaned up by the store). */
export const delBooking = (l: Log, id: string): Log => ({ ...l, bookings: l.bookings.filter((b) => b.id !== id), attachments: l.attachments.filter((a) => a.bookingId !== id) });
export const addAttachment = (l: Log, a: Attachment): Log => ({ ...l, attachments: upsert(l.attachments, a) });
export const delAttachment = (l: Log, id: string): Log => ({ ...l, attachments: l.attachments.filter((a) => a.id !== id) });
export const delExpense = (l: Log, id: string): Log => ({ ...l, expenses: l.expenses.filter((e) => e.id !== id) });

/** Save an expense; if it's in a foreign currency, `rate` (1 unit = how many home) is saved for all expenses in it. */
export function putExpense(l: Log, e: Expense, rate?: number): Log {
  const rates = rate && rate > 0 && e.currency !== l.trip.home ? { ...l.trip.rates, [e.currency]: rate } : l.trip.rates;
  return { ...l, expenses: upsert(l.expenses, e), trip: { ...l.trip, rates, lastCur: e.currency } };
}

/** Home currency and budget. Rates are relative to the home currency, so changing it clears them. */
export function putMoney(l: Log, home: string, budget: number, rates: Record<string, number>): Log {
  return { ...l, trip: { ...l.trip, home, budget, rates: home === l.trip.home ? rates : {} } };
}

/** A new trip name and dates, with an end that can't come before the start. */
export const validTripDates = (start: string, end: string) => (!start || isRealDay(start)) && (!end || isRealDay(end)) && (!start || !end || end >= start);

export const BACKUP_EVERY_DAYS = 7;
/** Something worth losing is here and it has been a week since a backup (or since the trip began). */
export function backupDue(l: Log, now = Date.now()): boolean {
  const has = l.items.length + l.bookings.length + l.expenses.length > 0;
  return has && now - (l.settings.lastBackupAt ?? l.settings.createdAt) > BACKUP_EVERY_DAYS * 86_400_000;
}

/** "3 bookings, 2 activities, 5 expenses": what a backup or an undo version holds. */
export const summary = (l: Pick<Log, 'bookings' | 'items' | 'expenses'>) =>
  `${plural(l.bookings.length, 'booking')}, ${l.items.length} ${l.items.length === 1 ? 'activity' : 'activities'}, ${plural(l.expenses.length, 'expense')}`;

/** A new activity starts on the first day of the trip if it is still ahead, otherwise today. */
export const defaultDay = (t: Trip, day: string) => (t.start && t.start > day ? t.start : day);

/** How the Bookings tab sorts bookings into sections, in this order. */
export const BOOKING_GROUPS: { id: string; label: string; icon: string; types: BookingType[] }[] = [
  { id: 'flights', label: 'Flights', icon: 'airplane', types: ['flight'] },
  { id: 'stays', label: 'Stays', icon: 'bed', types: ['hotel', 'airbnb'] },
  { id: 'transport', label: 'Cars and trains', icon: 'car', types: ['car', 'train'] },
  { id: 'activities', label: 'Activities and tickets', icon: 'ticket', types: ['activity'] },
  { id: 'insurance', label: 'Insurance and visas', icon: 'shield-checkmark', types: ['insurance'] },
  { id: 'other', label: 'Other documents', icon: 'document-text', types: ['other'] },
];

/** The sections that have something in them, each with its bookings in date order (undated last). */
export function groupBookings(l: Log) {
  const all = sortedBookings(l);
  return BOOKING_GROUPS
    .map((g) => ({ ...g, bookings: all.filter((b) => g.types.includes(b.type)) }))
    .filter((g) => g.bookings.length);
}

/** Nights of a stay, from its check-in and check-out days; null when it has no dates or is not a stay. */
export function nights(b: Booking): number | null {
  if (b.type !== 'hotel' && b.type !== 'airbnb') return null;
  if (!b.start || !b.end) return null;
  const n = diffDays(splitStamp(b.start)[0], splitStamp(b.end)[0]);
  return n > 0 ? n : null;
}

// ---- time zones: times are kept as written on the ticket and labelled with the zone they are in, never converted ----

const ABBR: Record<string, string> = { 'Asia/Kolkata': 'IST', 'Asia/Dubai': 'GST', 'Asia/Muscat': 'GST', 'Asia/Qatar': 'AST', 'Asia/Riyadh': 'AST', 'Asia/Bahrain': 'AST',
  'Asia/Kuwait': 'AST', 'Asia/Singapore': 'SGT', 'Asia/Bangkok': 'ICT', 'Asia/Ho_Chi_Minh': 'ICT', 'Asia/Hong_Kong': 'HKT', 'Asia/Tokyo': 'JST', 'Asia/Seoul': 'KST',
  'Asia/Colombo': 'IST', 'Asia/Kathmandu': 'NPT', 'Asia/Dhaka': 'BST', 'Asia/Kuala_Lumpur': 'MYT', 'Asia/Manila': 'PHT', 'Asia/Jakarta': 'WIB', 'Asia/Shanghai': 'CST' };

/** "IST, UTC+5:30" or "UTC+1" for a zone at a local time (the offset can change with daylight saving). Empty if the zone is unknown. */
export function zoneLabel(tz: string, stamp: string): string {
  try {
    const [d, t = '12:00'] = stamp.split('T');
    const [y, mo, da] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(Date.UTC(y, mo - 1, da, h, mi)));
    const off = (parts.find((p) => p.type === 'timeZoneName')?.value ?? '').replace('GMT', 'UTC') || 'UTC';
    return ABBR[tz] ? `${ABBR[tz]}, ${off}` : off;
  } catch { return ''; }
}
/** The short form for a row of text: "IST", or "UTC+1" when the zone has no common abbreviation. */
export const zoneShort = (label: string) => label.split(',')[0];

/** When a booking happens, for a list: "7 Nov, 06:15 IST → 08:25 GST" (a flight or train shows where it lands, in its own zone). */
export function whenText(b: Booking): string {
  if (!b.start) return '';
  const z = (tz: string | undefined, s: string) => { const l = tz ? zoneLabel(tz, s) : ''; return l ? ` ${zoneShort(l)}` : ''; };
  let out = `${fmtStamp(b.start)}${z(b.startTz, b.start)}`;
  if (b.end && (b.type === 'flight' || b.type === 'train')) {
    const [d0] = splitStamp(b.start);
    const [d1, t1] = splitStamp(b.end);
    out += ` → ${d1 === d0 ? t1 : fmtStamp(b.end)}${z(b.endTz, b.end)}`;
  }
  return out;
}
