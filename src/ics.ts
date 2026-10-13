// The calendar file (.ics) and the plain-text itinerary. Pure, so the exact output is unit tested.
// Times are floating local times: the phone's calendar shows them at the same clock time wherever you are.
import { addDays, dayKey, dayLabel, events, fmtDate, type Log } from './model.ts';

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (day: string, time: string) => `${day.replace(/-/g, '')}T${time.replace(':', '')}00`;
const plusMinutes = (day: string, time: string, m: number): [string, string] => {
  const x = new Date(`${day}T${time}:00`);
  x.setMinutes(x.getMinutes() + m);
  return [dayKey(x), `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`];
};

/** RFC 5545: lines are at most 75 octets; a longer one continues on the next line after a space. Never splits a character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const alarm = (minutes: number, text: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:-PT${minutes}M`, 'END:VALARM'];

/**
 * Every dated stop and booking, with reminders: flights 1 day and 3 hours before, anything else 1 hour before.
 * `withPreview` adds an 8 PM "tomorrow's plan" event on each evening before a day with plans (from `todayDay` on).
 */
export function buildIcs(l: Log, withPreview: boolean, todayDay: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trip Keeper//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(l.trip.name)}`];
  const ev = events(l);
  ev.forEach((e, n) => {
    out.push('BEGIN:VEVENT', `UID:tk-${e.id}-${n}@tripkeeper`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const [d2, t2] = plusMinutes(e.date, e.time, 60);
      out.push(`DTSTART:${dt(e.date, e.time)}`, `DTEND:${dt(d2, t2)}`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
    }
    out.push(`SUMMARY:${esc(`${e.emoji} ${e.title}`)}`);
    if (e.place) out.push(`LOCATION:${esc(e.place)}`);
    if (e.sub) out.push(`DESCRIPTION:${esc(e.sub)}`);
    if (e.time) {
      if (e.type === 'flight') out.push(...alarm(1440, 'Flight tomorrow: check in online and pack'), ...alarm(180, 'Time to head to the airport'));
      else out.push(...alarm(60, e.title));
    }
    out.push('END:VEVENT');
  });
  if (withPreview) {
    for (const d of new Set(ev.map((e) => e.date))) {
      const eve = addDays(d, -1);
      if (eve < todayDay) continue;
      const day = ev.filter((e) => e.date === d);
      out.push('BEGIN:VEVENT', `UID:tk-preview-${d}@tripkeeper`, `DTSTAMP:${stamp}`, `DTSTART:${dt(eve, '20:00')}`, `DTEND:${dt(eve, '20:15')}`,
        `SUMMARY:${esc(`Tomorrow's plan (${dayLabel(l.trip, d) || fmtDate(d)})`)}`,
        `DESCRIPTION:${esc(day.map((e) => `${e.time ? `${e.time} ` : ''}${e.title}`).join('\n'))}`,
        ...alarm(0, `Tomorrow: ${day.length} thing${day.length === 1 ? '' : 's'} planned`), 'END:VEVENT');
    }
  }
  out.push('END:VCALENDAR');
  return `${out.map(fold).join('\r\n')}\r\n`;
}

/** The itinerary as text for WhatsApp or email. Booking references are left out on purpose: they only ever appear in an event's subtitle, which this never uses. */
export function planText(l: Log): string {
  const t = l.trip;
  const ev = events(l);
  let out = `${t.name}${t.start ? ` · ${fmtDate(t.start)}${t.end ? ` to ${fmtDate(t.end)}` : ''}` : ''}\n`;
  for (const d of new Set(ev.map((e) => e.date))) {
    const label = dayLabel(t, d);
    out += `\n${fmtDate(d)}${label ? ` (${label})` : ''}\n`;
    for (const e of ev.filter((x) => x.date === d)) out += `• ${e.time ? `${e.time} ` : ''}${e.emoji} ${e.title}${e.place ? ` — ${e.place}` : ''}\n`;
  }
  return out.trim();
}

const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** A plain page to print or save as PDF: no references, no styling that depends on the app. */
export function planHtml(l: Log): string {
  const t = l.trip;
  const ev = events(l);
  const days = [...new Set(ev.map((e) => e.date))].map((d) => {
    const label = dayLabel(t, d);
    const rows = ev.filter((e) => e.date === d).map((e) =>
      `<li><b>${html(e.time)}</b> ${html(e.emoji)} ${html(e.title)}${e.place ? `<br><small>${html(e.place)}</small>` : ''}</li>`).join('');
    return `<h2>${html(fmtDate(d))}${label ? ` <small>${html(label)}</small>` : ''}</h2><ul>${rows}</ul>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><title>${html(t.name)}</title>
<style>body{font:15px/1.4 system-ui,sans-serif;margin:24px;color:#000}h1{margin:0 0 4px}h2{font-size:16px;margin:18px 0 6px;border-bottom:1px solid #ccc}
small{color:#555;font-weight:400}ul{list-style:none;padding:0;margin:0}li{padding:4px 0;break-inside:avoid}</style>
<h1>${html(t.name)}</h1><div>${html(t.start ? `${fmtDate(t.start)}${t.end ? ` to ${fmtDate(t.end)}` : ''}` : '')}</div>${days}`;
}
