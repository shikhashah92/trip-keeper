// Paste a confirmation: a heuristic reader for the text of a booking email or page. It only prefills the booking form;
// the person reviews everything before saving, so a wrong guess costs a correction, not a wrong booking.
import type { BookingType } from './model.ts';

/** `guessed` lists the times that were not found and were set to noon: they need checking. */
export interface Parsed { type: BookingType; ref?: string; start?: string; end?: string; title: string; place?: string; guessed?: ('start' | 'end')[] }

const MONTH: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MM = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const pad = (n: number | string) => String(n).padStart(2, '0');

export function parsePaste(text: string): Parsed {
  const t = text.replace(/\r/g, '');
  const low = t.toLowerCase();
  const type: BookingType = /airbnb/.test(low) ? 'airbnb'
    : /(\bpnr\b|boarding pass|airline|\bflight\b|e-?ticket)/.test(low) ? 'flight'
    : /(car rental|rental car|hertz|avis|europcar|sixt|drop-?off)/.test(low) ? 'car'
    : /(\btrain\b|renfe|\brail\b|\bbus\b)/.test(low) ? 'train'
    : /(check-?in|hotel|resort|booking\.com|\bstay\b)/.test(low) ? 'hotel'
    : /(admission|\btour\b|\bentry\b|\bticket)/.test(low) ? 'activity' : 'other';
  const out: Parsed = { type, title: '' };

  // A reference has a digit, or is all capitals (so "booking confirmed" is not a reference).
  for (const m of t.matchAll(/(?:confirmation|booking|reservation|reference|PNR|itinerary|order)(?:[ \t]*(?:number|no\.?|code|id|reference|ref|#))?[ \t]*[:#-]?[ \t]*([A-Z0-9][A-Z0-9-]{4,15})/gi)) {
    const x = m[1];
    if (/\d/.test(x) || x === x.toUpperCase()) { out.ref = x; break; }
  }

  const found: { i: number; date: string }[] = [];
  const add = (i: number, y: string, mo: number, d: number) => { if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) found.push({ i, date: `${y}-${pad(mo)}-${pad(d)}` }); };
  for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) add(m.index, m[1], +m[2], +m[3]);
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MM})[a-z]*\\.?,?\\s+(\\d{4})`, 'gi'))) add(m.index, m[3], MONTH[m[2].toLowerCase()], +m[1]);
  for (const m of t.matchAll(new RegExp(`(${MM})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi'))) add(m.index, m[3], MONTH[m[1].toLowerCase()], +m[2]);
  for (const m of t.matchAll(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/g)) add(m.index, m[3], +m[2], +m[1]); // day first, as in India and Europe
  found.sort((a, b) => a.i - b.i);

  // The time on the same line as the date (after it, then anywhere on the line), then on the line below (tickets often
  // put "Departs" and the time under the date). Noon when none is found; the caller is told, so the person checks it.
  const timeNear = (i: number): string | null => {
    const ls = t.lastIndexOf('\n', i) + 1;
    let le = t.indexOf('\n', i);
    if (le < 0) le = t.length;
    let le2 = t.indexOf('\n', le + 1);
    if (le2 < 0) le2 = t.length;
    const rx = /(\d{1,2}):(\d{2})\s*(am|pm)?/i;
    const m = t.slice(i, le).match(rx) ?? t.slice(ls, le).match(rx) ?? t.slice(le + 1, le2).match(rx);
    if (!m) return null;
    let h = +m[1];
    const ap = (m[3] ?? '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${pad(h)}:${m[2]}`;
  };
  if (found[0]) {
    const t0 = timeNear(found[0].i);
    out.start = `${found[0].date}T${t0 ?? '12:00'}`;
    if (!t0) out.guessed = ['start'];
    const e = found.find((f) => f.i !== found[0].i && f.date >= found[0].date);
    if (e) {
      const t1 = timeNear(e.i);
      out.end = `${e.date}T${t1 ?? '12:00'}`;
      if (!t1) out.guessed = [...(out.guessed ?? []), 'end'];
    }
  }

  const sub = t.match(/^subject:\s*(.+)$/im);
  const route = t.match(/\(([A-Z]{3})\)[^()]{0,80}\(([A-Z]{3})\)/);
  const first = t.split('\n').map((x) => x.trim()).find((x) => x && x.length <= 80) ?? '';
  out.title = (sub ? sub[1].replace(/^((fwd?|re):\s*)+/i, '') : type === 'flight' && route ? `Flight ${route[1]} → ${route[2]}` : first).slice(0, 90);
  const ad = t.match(/^(?:property )?(?:address|location)\s*:\s*(.+)$/im);
  if (ad) out.place = ad[1].trim();
  return out;
}

export type Field = 'type' | 'title' | 'ref' | 'start' | 'end' | 'place';
export interface Change { field: Field; from: string; to: string; guessed: boolean }
export interface Current { type: BookingType; title: string; ref: string; start: string; end: string; place: string }

/**
 * What reading a file would change in a booking form. Only things the file actually gave are proposed, and a title or
 * type the person already chose is left alone (a title is guessed from the first line; it is wrong more often than not).
 * `isNew`: a booking not saved yet, where the type is still the form's default.
 */
export function diffBooking(cur: Current, p: Parsed, isNew: boolean): Change[] {
  const out: Change[] = [];
  const put = (field: Field, from: string, to: string | undefined, guessed = false) => { if (to && to !== from) out.push({ field, from, to, guessed }); };
  if (isNew && p.type !== 'other') put('type', cur.type, p.type);
  if (!cur.title.trim()) put('title', cur.title, p.title);
  put('ref', cur.ref, p.ref);
  put('start', cur.start, p.start, !!p.guessed?.includes('start'));
  put('end', cur.end, p.end, !!p.guessed?.includes('end'));
  put('place', cur.place, p.place);
  return out;
}
