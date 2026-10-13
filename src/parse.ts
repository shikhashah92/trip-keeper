// Paste a confirmation: a heuristic reader for the text of a booking email or page. It only prefills the booking form;
// the person reviews everything before saving, so a wrong guess costs a correction, not a wrong booking.
import type { BookingType } from './model.ts';

export interface Parsed { type: BookingType; ref?: string; start?: string; end?: string; title: string; place?: string }

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

  // The time on the same line, after the date or before it; noon when none is found (the form says so).
  const timeNear = (i: number) => {
    const ls = t.lastIndexOf('\n', i) + 1;
    let le = t.indexOf('\n', i);
    if (le < 0) le = t.length;
    const rx = /(\d{1,2}):(\d{2})\s*(am|pm)?/i;
    const m = t.slice(i, le).match(rx) ?? t.slice(ls, le).match(rx);
    if (!m) return '12:00';
    let h = +m[1];
    const ap = (m[3] ?? '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${pad(h)}:${m[2]}`;
  };
  if (found[0]) {
    out.start = `${found[0].date}T${timeNear(found[0].i)}`;
    const e = found.find((f) => f.i !== found[0].i && f.date >= found[0].date);
    if (e) out.end = `${e.date}T${timeNear(e.i)}`;
  }

  const sub = t.match(/^subject:\s*(.+)$/im);
  const route = t.match(/\(([A-Z]{3})\)[^()]{0,80}\(([A-Z]{3})\)/);
  const first = t.split('\n').map((x) => x.trim()).find((x) => x && x.length <= 80) ?? '';
  out.title = (sub ? sub[1].replace(/^((fwd?|re):\s*)+/i, '') : type === 'flight' && route ? `Flight ${route[1]} → ${route[2]}` : first).slice(0, 90);
  const ad = t.match(/^(?:property )?(?:address|location)\s*:\s*(.+)$/im);
  if (ad) out.place = ad[1].trim();
  return out;
}
