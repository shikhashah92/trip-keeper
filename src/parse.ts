// Reads booking details from the text of a confirmation (a pasted email, or what was read from a PDF or screenshot).
// It is a heuristic: it only prefills the booking form, and the person reviews everything before saving, so a wrong
// guess costs a correction, not a wrong booking.
import { addDays, dayKey, type BookingType } from './model.ts';

/** `guessed` lists the times that were not found and were set to noon: they need checking. */
export interface Parsed { type: BookingType; ref?: string; start?: string; end?: string; title: string; place?: string; guessed?: ('start' | 'end')[]; notes?: string; startTz?: string; endTz?: string }

const MONTH: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MM = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const pad = (n: number | string) => String(n).padStart(2, '0');

// What each kind of booking says about itself, with a weight for how telling it is. A document is the kind with the
// most evidence, so a flight email that mentions a hotel offer is still a flight. Case-insensitive; airport codes in
// brackets, like (BOM), are matched on the original text.
const SIGNALS: Record<Exclude<BookingType, 'other'>, [RegExp, number][]> = {
  flight: [[/\bpnr\b/, 4], [/boarding pass/, 4], [/\bflights?\b/, 2], [/\bair(lines?|ways)\b|\bindigo\b|\bvistara\b|\bemirates\b|\bqatar\b/, 2],
    [/e-?ticket/, 2], [/\bgate\b/, 1], [/\bterminal\b/, 1], [/\bdepart(s|ure)?\b/, 1], [/\bseat\b/, 1], [/\bbaggage\b|\bcabin\b/, 1]],
  hotel: [[/\bhotel\b/, 3], [/check-?in/, 2], [/check-?out/, 2], [/\bresort\b/, 2], [/\brooms?\b/, 1], [/\bnights?\b/, 2], [/\bguests?\b/, 1],
    [/booking\.com|agoda|expedia|hotels\.com|\boyo\b/, 2], [/\bstay\b/, 1], [/\breception\b/, 1]],
  airbnb: [[/airbnb/, 6], [/\bhost\b/, 1], [/hosted by/, 3], [/\bentire (home|place|apartment|villa)\b/, 3]],
  car: [[/car rental|rental car|car hire/, 5], [/hertz|avis|europcar|sixt|enterprise|zoomcar|drivezy/, 4], [/drop-?off/, 2], [/pick-?up/, 2], [/\bmileage\b|fuel policy|\bdeposit\b/, 2]],
  train: [[/\btrain\b/, 3], [/renfe|irctc|eurostar|amtrak|sncf|trenitalia|deutsche bahn|redbus/, 4], [/\brail\b/, 2], [/\bplatform\b/, 2], [/\bbus\b/, 2], [/\bcoach\b/, 1]],
  activity: [[/admission|\bentry\b/, 2], [/\btickets?\b/, 1], [/\btour\b|excursion|museum|guided|sightseeing/, 3], [/\bvoucher\b/, 1],
    [/viator|getyourguide|klook|tripadvisor/, 4], [/\bshow\b|concert|\bevent\b|\bperformance\b/, 1]],
  insurance: [[/insurance|\binsured\b|policy (number|no)|\bpremium\b|\bcoverage\b|assistance/, 4], [/\bvisa\b|e-?visa|\beta\b|passport|entry permit|immigration/, 3]],
};
const AIRPORT = /\([A-Z]{3}\)/g;

/** The kind of booking a text describes, or 'other' when nothing in it is telling enough. */
export function classify(text: string): BookingType {
  const low = text.toLowerCase();
  let best: BookingType = 'other';
  let top = 1.5; // below this there is too little to go on
  for (const [kind, signals] of Object.entries(SIGNALS) as [Exclude<BookingType, 'other'>, [RegExp, number][]][]) {
    let score = signals.reduce((n, [rx, w]) => n + (rx.test(low) ? w : 0), 0);
    if (kind === 'flight') score += Math.min(2, (text.match(AIRPORT) ?? []).length); // (BOM) ... (MAD)
    if (score > top) { top = score; best = kind; }
  }
  return best;
}

// A date on a line like these is when the booking was made or paid, not when the trip happens.
const NOT_TRIP = /\bbooked\b|booking (?:date|time|made|on)|date of booking|reservation date|\bissued?\b|issue date|date of issue|ticketed on|confirmed on|confirmation date|invoice|\bbill\b|receipt|payment|paid on|printed|generated|created|order date|purchase|transaction|date of birth|\bdob\b|valid (?:till|until)|expir|cancel(?:lation)? (?:by|before|until)/i;
const TRIP = /depart|arriv|check-?in|check-?out|pick-?up|drop-?off|\bfrom\b|\bto\b|travel|journey|start|\bend\b|onward|return|stay/i;
const REF_STOP = /^(CONFIRMED|CONFIRMATION|BOOKING|RESERVATION|DEPARTURE|ARRIVAL|DETAILS|NUMBER|TICKET|STATUS|PASSENGER|ITINERARY|REFERENCE|SUMMARY|RECEIPT)$/;
const LABEL = /^(?:departure|arrival|depart(?:s|ing)?|arrive(?:s)?|from|to|origin|destination|airport)[\s:.-]*/i;

/**
 * The booking reference: it has a digit, or is all capitals (so "booking confirmed" is not a reference), and may sit
 * on the line below its label. One with a digit wins over a word in capitals.
 */
export function findRef(t: string): string | undefined {
  const refs: string[] = [];
  const refRx = /(?:confirmation|booking|reservation|reference|PNR|itinerary|order|e-?ticket)(?:[ \t]*\([^)\n]{1,15}\))?(?:[ \t]*(?:number|no\.?|code|id|reference|ref|#))?[ \t]*[:#-]?[ \t]*(?:\n[ \t]*)?([A-Z0-9][A-Z0-9-]{4,15})\b/gi;
  for (let m = refRx.exec(t); m; m = refRx.exec(t)) {
    refs.push(m[1]);
    refRx.lastIndex = m.index + 1; // the value may itself be the next label's start: look again from just after this label
  }
  return refs.find((x) => /\d/.test(x)) ?? refs.find((x) => x === x.toUpperCase() && !REF_STOP.test(x));
}

export function parsePaste(text: string, forceType?: BookingType): Parsed {
  const t = text.replace(/\r/g, '');
  const type = forceType ?? classify(t);
  const out: Parsed = { type, title: '' };
  const lineAt = (i: number) => {
    const ls = t.lastIndexOf('\n', i) + 1;
    const le = t.indexOf('\n', i);
    return t.slice(ls, le < 0 ? t.length : le);
  };

  out.ref = findRef(t);

  // Dates, in the ways tickets write them: 2026-11-07, 7 Nov 2026, 7th November 2026, 07NOV26, 7 Nov '26, Nov 7, 2026,
  // 07/11/2026 (day first, as in India and Europe), and "Sat, 07 Nov" with no year (the year of the other dates is used).
  const found: { i: number; date: string }[] = [];
  const add = (i: number, y: number, mo: number, d: number) => {
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) found.push({ i, date: `${y}-${pad(mo)}-${pad(d)}` });
  };
  const year = (s: string) => (s.length === 2 ? 2000 + +s : +s);
  for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) add(m.index, +m[1], +m[2], +m[3]);
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]*(${MM})[a-z]*\\.?[\\s,'’-]*(\\d{4}|\\d{2}(?![\\d:]))`, 'gi'))) add(m.index, year(m[3]), MONTH[m[2].toLowerCase()], +m[1]);
  for (const m of t.matchAll(new RegExp(`(${MM})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi'))) add(m.index, +m[3], MONTH[m[1].toLowerCase()], +m[2]);
  for (const m of t.matchAll(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g)) add(m.index, +m[3], +m[2], +m[1]);
  for (const m of t.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2})(?![\d:])/g)) add(m.index, 2000 + +m[3], +m[2], +m[1]);
  // Ranges, as Airbnb and hotels write a stay: "Oct 23 – 26, 2026", "23–26 Oct 2026", "Oct 30 – Nov 2, 2026". Two dates each.
  const DASH = '(?:[–—-]|\\bto\\b)';
  for (const m of t.matchAll(new RegExp(`(${MM})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*${DASH}\\s*(?:(${MM})[a-z]*\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi'))) {
    const mo1 = MONTH[m[1].toLowerCase()];
    const at2 = m.index + m[0].search(/[–—-]|\bto\b/i) + 1;
    add(m.index, +m[5], mo1, +m[2]);
    add(at2, +m[5], m[3] ? MONTH[m[3].toLowerCase()] : mo1, +m[4]);
  }
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*${DASH}\\s*(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]*(${MM})[a-z]*\\.?,?\\s+(\\d{4})`, 'gi'))) {
    const mo = MONTH[m[3].toLowerCase()];
    add(m.index, +m[4], mo, +m[1]);
    add(m.index + m[0].search(/[–—-]|\bto\b/i) + 1, +m[4], mo, +m[2]);
  }
  // No year: borrow it from a date that has one, else the current year (a past date then means next year).
  const withYear = found.length ? +found[0].date.slice(0, 4) : null;
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MM})[a-z]*\\b(?![\\s,'’.-]*\\d{2,4}(?![\\d:]))`, 'gi'))) {
    if (found.some((f) => Math.abs(f.i - m.index) < 2)) continue;
    const mo = MONTH[m[2].toLowerCase()];
    let y = withYear ?? new Date().getFullYear();
    if (withYear === null && new Date(y, mo - 1, +m[1]).getTime() < Date.now() - 60 * 864e5) y++;
    add(m.index, y, mo, +m[1]);
  }
  for (const m of t.matchAll(new RegExp(`\\b(${MM})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![\\d:])(?!\\s*,?\\s*\\d{4})`, 'gi'))) {
    if (found.some((f) => Math.abs(f.i - m.index) < 2)) continue; // already read, with its year or as part of a range
    const mo = MONTH[m[1].toLowerCase()];
    let y = withYear ?? new Date().getFullYear();
    if (withYear === null && new Date(y, mo - 1, +m[2]).getTime() < Date.now() - 60 * 864e5) y++;
    add(m.index, y, mo, +m[2]);
  }
  found.sort((a, b) => a.i - b.i);
  // The same date read two ways at nearly the same place (a range and a plain date) is one date.
  for (let k = found.length - 1; k > 0; k--) if (found[k].date === found[k - 1].date && found[k].i - found[k - 1].i < 6) found.splice(k, 1);
  // Dates on "booked on" or "payment" lines are not the trip. If that leaves nothing, keep them all.
  // A date is the booking's, not the trip's, when a booking label is on its line, or sits alone on its line under or
  // over such a label ("Booking date" / "19 Aug 2026"). That date is then left out wherever else it appears, unless that
  // place is plainly about the trip.
  const short = (x: string) => x.trim().length <= 32;
  const aboutBooking = (f: { i: number }) => {
    const ls = t.lastIndexOf('\n', f.i) + 1;
    let le = t.indexOf('\n', f.i);
    if (le < 0) le = t.length;
    const cur = t.slice(ls, le);
    if (NOT_TRIP.test(cur) && !TRIP.test(cur)) return true;
    // Only a line that is just a date (and maybe a time) is described by the lines around it; a date inside a longer
    // line, like "Departure: 07 Nov 2026 06:15", is described by that line.
    const rest = cur.replace(/\b(?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|am|pm|hrs?|st|nd|rd|th)[a-z]*\b/gi, '');
    if (/[A-Za-z]/.test(rest) || !short(cur)) return false;
    const prev = ls > 1 ? t.slice(t.lastIndexOf('\n', ls - 2) + 1, ls - 1) : '';
    let ne = t.indexOf('\n', le + 1);
    if (ne < 0) ne = t.length;
    const next = t.slice(le + 1, ne);
    return (short(prev) && NOT_TRIP.test(prev) && !TRIP.test(prev)) || (short(next) && NOT_TRIP.test(next) && !TRIP.test(next));
  };
  const madeOn = new Set(found.filter(aboutBooking).map((f) => f.date));
  const trip = found.filter((f) => !aboutBooking(f) && !(madeOn.has(f.date) && !TRIP.test(lineAt(f.i))));
  const dates = trip.length ? trip : found;

  // Times, as tickets write them: 06:15, 6:15 PM, 10 AM, 06.15 hrs, 0615 hrs, and 06;15 (what OCR makes of a colon).
  const TIME = /(\d{1,2})\s?[:;]\s?(\d{2})(?:\s?(am|pm)\b)?|(\d{1,2})\.(\d{2})\s?(am|pm|hrs?)\b|\b([01]\d|2[0-3])([0-5]\d)\s?(?:hrs?|h)\b|\b(\d{1,2})\s?(am|pm)\b/gi;
  // A time right after one of these is not when the thing starts: boarding and gate times on a flight, doors and last
  // entry on a ticket. (An end is allowed to be one of them: "ends 12:30" is the end.)
  const NOT_DEPARTURE = /boarding|gate|check-?in|report|baggage|counter|clos(?:es|ing)|drop/i;
  const NOT_START = /doors?|opens?|open at|arrive|arrival|before|\bby\b|ends?|until|till|\bto\b|clos(?:es|ing)|last entry|valid|duration|up to/i;
  interface Clock { time: string; at: number; to: number }
  const clocksIn = (from: number, to: number, strict: boolean): Clock[] => {
    const out: Clock[] = [];
    for (const m of t.slice(from, to).matchAll(TIME)) {
      const at = from + m.index;
      let h: number, mi = 0, ap = '';
      if (m[1] !== undefined) { h = +m[1]; mi = +m[2]; ap = (m[3] ?? '').toLowerCase(); }
      else if (m[4] !== undefined) { h = +m[4]; mi = +m[5]; ap = /am|pm/i.test(m[6]) ? m[6].toLowerCase() : ''; }
      else if (m[7] !== undefined) { h = +m[7]; mi = +m[8]; }
      else { h = +m[9]; ap = m[10].toLowerCase(); }
      if (mi > 59 || h > 23 || (ap && (h > 12 || h < 1))) continue;
      const before = t.slice(Math.max(0, at - 28), at).split(String.fromCharCode(10)).pop() ?? ''; // this line only
      if (strict && type === 'flight' && NOT_DEPARTURE.test(before)) continue;
      if (strict && type !== 'flight' && NOT_START.test(before)) continue;
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      out.push({ time: `${pad(h)}:${pad(mi)}`, at, to: at + m[0].length });
    }
    return out;
  };
  // The time on the same line as the date (after it, then anywhere on the line), then on the line below (tickets often
  // put the date over the time, or two dates over two times). Times already used are skipped, so an arrival never
  // takes the departure's time. None found: the caller sets noon and flags it.
  const used = new Set<number>();
  const timeNear = (i: number, strict = true): Clock | null => {
    const ls = t.lastIndexOf('\n', i) + 1;
    let le = t.indexOf('\n', i);
    if (le < 0) le = t.length;
    // Below the date: the next few lines, up to the next date (labels like "Boarding" or "Doors open" often come first).
    const below = Math.min(dates.find((f) => f.i > le)?.i ?? t.length, le + 1 + 240);
    // A time on a line of its own right above the date ("23:10" over "23 Oct 2026") belongs to that date, and is
    // looked at before the lines below, which may hold the next date's time.
    const ps = ls > 1 ? t.lastIndexOf('\n', ls - 2) + 1 : 0;
    const above = t.slice(ps, Math.max(ps, ls - 1));
    const timeAbove = ls > 0 && /^\s*(?:\d{1,2}\s?[:;]\s?\d{2}\s*(?:am|pm|hrs?)?\s*)+$/i.test(above);
    const windows: [number, number][] = [[i, le], [ls, le], ...(timeAbove ? [[ps, ls] as [number, number]] : []), [le + 1, below], [Math.max(0, ls - 120), ls]];
    for (const [a, b] of windows) {
      const c = clocksIn(a, b, strict).find((x) => !used.has(x.at));
      if (c) { used.add(c.at); return c; }
    }
    return null;
  };
  const stamp = (date: string, time: string, plusMinutes = 0) => {
    if (!plusMinutes) return `${date}T${time}`;
    const d = new Date(`${date}T${time}:00`);
    d.setMinutes(d.getMinutes() + plusMinutes);
    return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  /** "08:20 +1" or "(+1)": the arrival is on a later day than its date says. */
  const later = (c: Clock | null | undefined, date: string) => {
    const m = c ? t.slice(c.to, c.to + 8).match(/^\s*\(?\+\s?(\d)\b/) : null;
    return m ? addDays(date, +m[1]) : date;
  };
  if (dates[0]) {
    const c0 = timeNear(dates[0].i);
    const t0 = c0?.time ?? null;
    out.start = `${dates[0].date}T${t0 ?? '12:00'}`;
    if (!t0) out.guessed = ['start'];
    const e = dates.find((f) => f.i !== dates[0].i && f.date >= dates[0].date);
    if (e) {
      const c1 = timeNear(e.i, false);
      out.end = `${later(c1, e.date)}T${c1?.time ?? '12:00'}`;
      if (!c1) out.guessed = [...(out.guessed ?? []), 'end'];
    } else if (c0) {
      // One date, one start time. The end is a range after it ("10:00 - 12:30", "from 10 AM to 12 PM"), a stated
      // duration ("Duration: 2 hours"), or, on a flight or train, the next time (the arrival: the next day if earlier).
      const next = dates.find((f) => f.i > c0.at)?.i ?? t.length;
      const range = t.slice(c0.to, c0.to + 24).match(/^\s*(?:-|–|—|to|until|till)\s*/i);
      const rc = range ? clocksIn(c0.to + range[0].length, Math.min(next, c0.to + range[0].length + 12), false)[0] : undefined;
      const dur = t.match(/duration\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b|minutes?|mins?)/i);
      if (rc && rc.time > c0.time) { used.add(rc.at); out.end = `${dates[0].date}T${rc.time}`; }
      else if (dur) out.end = stamp(dates[0].date, c0.time, Math.round(+dur[1] * (/^h/i.test(dur[2]) ? 60 : 1)));
      else if (type === 'flight' || type === 'train') {
        const c1 = clocksIn(c0.to, Math.min(next, c0.to + 400), false).find((x) => !used.has(x.at));
        if (c1) { used.add(c1.at); // An explicit "+1" says how many days later; without one, an earlier clock time means the next day.
          const plus = t.slice(c1.to, c1.to + 8).match(/^\s*\(?\+\s?(\d)\b/);
          out.end = `${plus ? addDays(dates[0].date, +plus[1]) : c1.time > c0.time ? dates[0].date : addDays(dates[0].date, 1)}T${c1.time}`; }
      }
    }
  }

  // A stay says what it means: the date and time after "Check-in" and after "Check-out" (or Arrive / Depart / Leave).
  // The value may follow its label, or the labels may be a header row with the values on the line below in the same order.
  if (type === 'hotel' || type === 'airbnb') {
    const labs: { at: number; end: number; kind: 'in' | 'out' }[] = [];
    for (const m of t.matchAll(/check[\s-]?in|\barriv(?:e|es|al|ing)\b/gi)) labs.push({ at: m.index, end: m.index + m[0].length, kind: 'in' });
    for (const m of t.matchAll(/check[\s-]?out|\bdepart(?:s|ure)?\b|\bleav(?:e|es|ing)\b/gi)) labs.push({ at: m.index, end: m.index + m[0].length, kind: 'out' });
    labs.sort((a, b) => a.at - b.at);
    const got: { in?: { date?: string; time?: string }; out?: { date?: string; time?: string } } = {};
    const put = (kind: 'in' | 'out', date?: string, time?: string) => {
      const cur = got[kind] ?? {};
      got[kind] = { date: cur.date ?? date, time: cur.time ?? time };
    };
    for (let k = 0; k < labs.length; k++) {
      const lab = labs[k];
      const stop = Math.min(labs[k + 1]?.at ?? t.length, lab.end + 200);
      const d = dates.find((f) => f.i >= lab.end && f.i < stop);
      if (d) { put(lab.kind, d.date, clocksIn(d.i, stop, false)[0]?.time); continue; }
      // A time with the label but the date elsewhere: "Check-in time: 3:00 PM".
      const c = clocksIn(lab.end, stop, false)[0];
      const nextIsClose = labs[k + 1] && labs[k + 1].at - lab.end < 80 && !dates.some((f) => f.i >= lab.end && f.i < labs[k + 1].at);
      // A label that has its own time right after it ("Check-in time: 3:00 PM") is not a header row, however near the next label is.
      if (!nextIsClose || c) { if (c) put(lab.kind, undefined, c.time); continue; }
      // A header row: this label and the ones right after it, then their values in the same order below.
      let g = k;
      while (labs[g + 1] && labs[g + 1].at - labs[g].end < 80 && !dates.some((f) => f.i >= labs[g].end && f.i < labs[g + 1].at)) g++;
      const group = labs.slice(k, g + 1);
      const ds = dates.filter((f) => f.i >= labs[g].end).slice(0, group.length);
      const cs = clocksIn(labs[g].end, ds.length ? Math.min(t.length, ds[ds.length - 1].i + 160) : labs[g].end + 240, false);
      group.forEach((l, j) => put(l.kind, ds[j]?.date, cs[j]?.time));
      k = g;
    }
    const set = (kind: 'in' | 'out') => {
      const v = got[kind];
      if (!v) return;
      const key = kind === 'in' ? 'start' : 'end';
      const date = v.date ?? out[key]?.slice(0, 10);
      if (!date) return;
      out[key] = `${date}T${v.time ?? '12:00'}`;
      out.guessed = (out.guessed ?? []).filter((x) => x !== key);
      if (!v.time) out.guessed.push(key);
      if (!out.guessed.length) delete out.guessed;
    };
    set('in');
    set('out');
    // Notes a traveller wants: how many nights and guests, the room, the host, a phone number.
    const nt: string[] = [];
    const nights = t.match(/(\d{1,2})\s*nights?\b/i);
    const guests = t.match(/(\d{1,2})\s*(?:adults?|guests?)\b/i) ?? t.match(/guests?\s*[:\-]?\s*(\d{1,2})\b/i);
    const room = t.match(/\broom(?:\s*type)?\s*[:\-]\s*([^\n]{3,50})/i);
    const host = t.match(/hosted by\s+([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?)/);
    const phone = t.match(/(?:phone|tel(?:ephone)?|contact)\s*[:\-]?\s*(\+?\d[\d ()-]{7,16}\d)/i);
    if (nights) nt.push(`Nights: ${nights[1]}`);
    if (guests) nt.push(`Guests: ${guests[1]}`);
    if (room) nt.push(`Room: ${room[1].trim()}`);
    if (host) nt.push(`Host: ${host[1]}`);
    if (phone) nt.push(`Phone: ${phone[1].trim()}`);
    if (nt.length) out.notes = nt.join('\n');
  }

  // Title: an email subject, then a labelled name ("Hotel: ..."), then a flight's number and route, then the first
  // line that isn't boilerplate.
  const sub = t.match(/^subject:\s*(.+)$/im);
  const named = t.match(/^(?:hotel name|hotel|property|accommodation|activity|tour|experience|event|vehicle|train|plan|product)\s*[:\-]\s*(.+)$/im);
  const route = t.match(/\(([A-Z]{3})\)[^()]{0,80}\(([A-Z]{3})\)/) ?? t.match(/\b([A-Z]{3})\s*(?:→|->|–|-|to)\s*([A-Z]{3})\b/);
  const fno = t.match(/\b(?:flight|flt)(?:\s*(?:no\.?|number))?\s*[:#-]?\s*([A-Z0-9]{2})[\s-]?(\d{2,4})\b/i);
  const flightTitle = type === 'flight' && (fno || route)
    ? `${fno ? `${fno[1].toUpperCase()} ${fno[2]}` : 'Flight'}${route ? ` ${route[1]} → ${route[2]}` : ''}` : '';
  const first = t.split('\n').map((x) => x.trim()).find((x) => x.length >= 3 && x.length <= 80 && !/^(e-?ticket|booking|confirmation|itinerary|receipt|invoice|tax|thank|dear|hello|hi\b|your)/i.test(x))
    ?? t.split('\n').map((x) => x.trim()).find((x) => x && x.length <= 80) ?? '';
  out.title = (sub ? sub[1].replace(/^((fwd?|re):\s*)+/i, '') : named ? named[1].trim() : flightTitle || first).slice(0, 90);

  // Place: a labelled address or venue; for a flight, the departure airport.
  const ad = t.match(/^(?:property |hotel |pick-?up |venue |meeting point |where\s*)?(?:address|location|venue|meeting point)\b[ \t]*[:\-]?[ \t]*\n?[ \t]*(.+)$/im);
  if (ad) out.place = ad[1].trim();
  else if (type === 'flight') {
    for (const m of t.matchAll(/([A-Za-z][A-Za-z .'-]{1,40}?)\s*\(([A-Z]{3})\)/g)) {
      const name = m[1].replace(LABEL, '').trim();
      if (name.length >= 3 && !LABEL.test(`${name} `) && !/^(departure|arrival|airport|terminal)$/i.test(name)) { out.place = `${name} (${m[2]})`; break; }
    }
  }
  return out;
}

export type Field = 'type' | 'title' | 'ref' | 'start' | 'end' | 'place' | 'notes';
export interface Change { field: Field; from: string; to: string; guessed: boolean }
export interface Current { type: BookingType; title: string; ref: string; start: string; end: string; place: string; notes?: string }

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
  // Details from the file go into the notes: filled in when empty, added below what is there otherwise (never replacing it).
  const have = (cur.notes ?? '').trim();
  if (p.notes && !have.includes(p.notes.split('\n')[0])) put('notes', have, have ? `${have}\n\n${p.notes}` : p.notes);
  return out;
}
